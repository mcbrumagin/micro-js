export MICRO_REGISTRY_URL=http://localhost:10000

export ENVIRONMENT=dev

# Registry token for testing (individual tests may override)
export MICRO_REGISTRY_TOKEN=dev-test-token-12345

# TODO dynamically set to info for full test run
export LOG_LEVEL=info
export LOG_INCLUDE_LINES=true
export LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES=true

export ADMIN_USER=testadmin
export ADMIN_SECRET=testsecret123

if npm list -g --depth=0 "c8" > /dev/null 2>&1; then
  c8 npm run test
else
  npm run test
  echo "c8 is not installed globally"
fi
