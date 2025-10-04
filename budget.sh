#!/bin/bash

if [ ! -d "./dist" ]; then
    echo "Error: 'dist' folder not found."
    echo "Please run 'npm run compile' to compile the code before running this script."
    exit 1
fi

node dist/index.js $@
