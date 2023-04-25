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
      readCapacity: 5,
      writeCapacity: 5,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // ** NOT recommended for production code **
    });

    const deadLetterQueue = new sqs.Queue(
      this,
      "wildrydes-existing-DLQ-queue",
      {
        queueName: "wildrydes-queue",
      }
    );

    // Use an EXISTING role
    const lambdaRole = iam.Role.fromRoleArn(
      this,
      "Existing-WildRydesStreamProcessorRole",
      "arn:aws:iam::174543029707:role/WildRydesStreamProcessorRole"
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
    const stream = kinesis.Stream.fromStreamArn(
      this,
      "ExistingStream",
      "arn:aws:kinesis:eu-west-1:174543029707:stream/wildrydes"
    );
    lambdaFn.addEventSource(
      new KinesisEventSource(stream, {
        batchSize: 10,
        maxBatchingWindow: cdk.Duration.seconds(15),
        startingPosition: lambda.StartingPosition.LATEST,
        onFailure: new SqsDlq(deadLetterQueue),
        retryAttempts: 2,
        maxRecordAge: cdk.Duration.seconds(60),
      })
    );

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
  }
}
