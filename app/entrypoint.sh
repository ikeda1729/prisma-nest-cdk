#!/bin/sh

echo 'Start entrypoint.sh...'

export SECRET_JSON=$(/app/getsecretvalue.js)

export DB_USER=$(echo $SECRET_JSON | jq -r .username)
export DB_PASSWORD=$(echo $SECRET_JSON | jq -r .password)
export DB_HOST=$(echo $SECRET_JSON | jq -r .host)
export DB_PORT=$(echo $SECRET_JSON | jq -r .port)
export DB_DATABASE=$(echo $SECRET_JSON | jq -r .dbname)

echo 'Start Service...'

exec "$@"
