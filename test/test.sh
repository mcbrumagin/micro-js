#!/bin/bash

export MICRO_REGISTRY_URL=http://localhost:10000

export ENVIRONMENT=dev

# Registry token for testing (individual tests may override)
export MICRO_REGISTRY_TOKEN=dev-test-token-12345

# TODO dynamically set to info for full test run
# export LOG_LEVEL=info
export MUTE_LOG_GROUP_OUTPUT=true
export LOG_INCLUDE_LINES=true
export LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES=true

export ADMIN_USER=testadmin
export ADMIN_SECRET=testsecret123

# Optional: Set coverage directory
export NODE_V8_COVERAGE=../coverage/tmp

export MUTE_SUCCESS_CASES=true

if npm list -g --depth=0 "c8" > /dev/null 2>&1; then
  c8 node test/run-all-cases.js
else
  node test/run-all-cases.js
  echo "c8 is not installed globally"
fi
