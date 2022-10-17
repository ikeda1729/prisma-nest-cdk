#!/usr/local/bin/node

const AWS = require('aws-sdk');
const region = process.env.AWS_DEFAULT_REGION;
const secretName = process.env.DB_SECRET_NAME;

const client = new AWS.SecretsManager({
  region: region,
});

const main = async () => {
  try {
    const secret = await client.getSecretValue({ SecretId: secretName }).promise();
    console.log(secret.SecretString);
  } catch (err) {
    console.error(err);
  }
};

main();
