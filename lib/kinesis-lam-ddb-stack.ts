import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { join } from "path";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import {
  KinesisEventSource,
  SqsDlq,
} from "aws-cdk-lib/aws-lambda-event-sources";

export class KinesisLamDdbStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const ddbUnicornSensorData = new ddb.Table(this, "UnicornSensorData", {
      partitionKey: {
        name: "Name",
        type: ddb.AttributeType.STRING,
      },
      sortKey: {
        name: "StatusTime",
        type: ddb.AttributeType.STRING,
      },
      tableName: "UnicornSensorData",
      billingMode: ddb.BillingMode.PROVISIONED,
      readCapacity: 2,
      writeCapacity: 2,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // ** NOT recommended for production code **
    });

    const deadLetterQueue = new sqs.Queue(this, "wildrydes-DLQ-queue", {
      queueName: "wildrydes-queue",
    });

    // Use an EXISTING role
    // const lambdaRole = iam.Role.fromRoleArn(
    //   this,
    //   "Existing-WildRydesStreamProcessorRole",
    //   "arn:aws:iam::174543029707:role/WildRydesStreamProcessorRole"
    // );

    const lambdaRole = new iam.Role(
      this,
      "WildRydesStreamProcessorExecutionRole",
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
        description: "Role to access kinesis and ",
        roleName: "WildRydesStreamProcessorExecutionRole",
      }
    );

    lambdaRole.addManagedPolicy(
      iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        "Apply.AWSLambdaKinesisExecutionRole",
        "arn:aws:iam::aws:policy/service-role/AWSLambdaKinesisExecutionRole"
      )
    );

    const lambdaFn = new lambda.Function(this, "Function", {
      functionName: "WildRydesStreamProcessor",
      runtime: lambda.Runtime.NODEJS_14_X,
      handler: "index.handler",
      deadLetterQueueEnabled: true,
      deadLetterQueue: deadLetterQueue,
      code: lambda.Code.fromAsset(join(__dirname, "../lambda")),
      role: lambdaRole,
      environment: {
        TABLE_NAME: ddbUnicornSensorData.tableName,
        AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
      },
      logRetention: 3,
    });

    const stream = new kinesis.Stream(this, "wildrydes-stream", {
      streamName: "wildrydes",
      streamMode: kinesis.StreamMode.PROVISIONED,
      shardCount: 1,
    });

    // Kinesis Fan out: REQUIRED
    const streamConsumerFanOut = new kinesis.CfnStreamConsumer(
      this,
      "Kinesis.Stream.FanOutConsumer",
      {
        streamArn: stream.streamArn,
        consumerName: "wildrydes-stream-consumer",
      }
    );

    // Kinesis Fan out: REQUIRED
    lambdaRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [streamConsumerFanOut.attrConsumerArn],
        actions: ["kinesis:SubscribeToShard"],
      })
    );

    // KinesisEventSourceProps
    const kinesisEventSourceBasicConfig = {
      batchSize: 30,
      maxBatchingWindow: cdk.Duration.seconds(30),
      startingPosition: lambda.StartingPosition.LATEST,
      onFailure: new SqsDlq(deadLetterQueue),
      retryAttempts: 1,
      bisectBatchOnError: true, // allows split batch when an error is thrown and retry
      reportBatchItemFailures: true, // is an efficiency on top of bisectBatchOnError, because allows retry to start at failed item, and not retry any prior items
      maxRecordAge: cdk.Duration.seconds(300),
    };

    // Kinesis Fan out: REQUIRED
    lambdaFn.addEventSourceMapping("KinesisConsumer", {
      ...kinesisEventSourceBasicConfig,
      eventSourceArn: streamConsumerFanOut.attrConsumerArn,
    });

    // Kinesis Standard: (no fan out) REQUIRED
    // Or simply use addEventSourceMapping() above, with eventSourceArn as stream ARN.
    // lambdaFn.addEventSource(
    //   new KinesisEventSource(stream,kinesisEventSourceBasicConfig )
    // );

    ddbUnicornSensorData.grantWriteData(lambdaFn);

    new cdk.CfnOutput(this, "DeadLetterQueue.ARN:", {
      value: deadLetterQueue.queueArn,
    });

    new cdk.CfnOutput(this, "UnicornSensorData.ARN:", {
      value: ddbUnicornSensorData.tableArn,
    });
    new cdk.CfnOutput(this, "LambdaFn.ARN", { value: lambdaFn.functionArn });
    new cdk.CfnOutput(this, "LambdaFn.Role.ARN", {
      value: lambdaFn.role!.roleArn,
    });
    new cdk.CfnOutput(this, "Kinesis.Stream.ARN", {
      value: stream.streamArn,
    });
  }
}
