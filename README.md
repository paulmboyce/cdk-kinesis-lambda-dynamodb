# BAsic AWS Kinesis & Lambda & DynamoDB Project

The kinesis consumer and producer are originally based on code at build
https://data-processing.serverlessworkshops.io/client/producer.go 
https://data-processing.serverlessworkshops.io/client/consumer.go 
from AWS tutorial https://data-processing.serverlessworkshops.io/

The rest is CDK code to build the infrastructure for the workshop


## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
