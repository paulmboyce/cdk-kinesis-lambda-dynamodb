"use strict";

const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME;
const ERROR_STRING = "error";

// Entrypoint for Lambda Function
exports.handler = function (event, context, callback) {
  console.log("Num Kinesis Records received = ", event.Records.length);

  const requestItems = buildRequestItems(event.Records);
  let reportFailures = null;

  const requests = buildRequests(requestItems.data);

  Promise.all(requests)
    .then(() => {
      if (requestItems.failure?.sequenceNumber) {
        reportFailures = {
          batchItemFailures: [
            {
              itemIdentifier: requestItems.failure.sequenceNumber,
            },
          ],
        };
        callback(null, reportFailures);
      } else {
        callback(null, `Delivered ${event.Records.length} records`);
      }
    })
    .catch(callback);
};

// Build DynamoDB request payload

function buildRequestItems(records) {
  const result = { data: [], failure: {} };
  try {
    records.forEach((record) => {
      const json = Buffer.from(record.kinesis.data, "base64").toString("ascii");
      const item = JSON.parse(json);
      const sequenceNumber = record.kinesis.sequenceNumber;
      console.debug("TRY Seq #", sequenceNumber);

      //Check for error and throw the error. This is more like a validation in your usecase
      if (item.InputData.toLowerCase().includes(ERROR_STRING)) {
        console.debug("ERR Seq # ", sequenceNumber);
        throw new Error(sequenceNumber);
      }
      result.data.push({
        PutRequest: {
          Item: item,
        },
      });
    });
  } catch (err) {
    result.failure.sequenceNumber = err.message;
  } finally {
    console.log("RESULT:", result);
    return result;
  }
}

function buildRequests(requestItems) {
  const requests = [];
  // Batch Write 25 request items from the beginning of the list at a time
  while (requestItems.length > 0) {
    const request = batchWrite(requestItems.splice(0, 25));

    requests.push(request);
  }

  return requests;
}

// Batch write items into DynamoDB table using DynamoDB API
function batchWrite(requestItems, attempt = 0) {
  const params = {
    RequestItems: {
      [tableName]: requestItems,
    },
  };

  let delay = 0;

  if (attempt > 0) {
    delay = 50 * Math.pow(2, attempt);
  }

  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      dynamoDB
        .batchWrite(params)
        .promise()
        .then(function (data) {
          if (data.UnprocessedItems.hasOwnProperty(tableName)) {
            return batchWrite(data.UnprocessedItems[tableName], attempt + 1);
          }
        })
        .then(resolve)
        .catch(reject);
    }, delay);
  });
}
