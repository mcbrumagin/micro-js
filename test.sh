export MICRO_REGISTRY_URL=http://localhost:10000

# TODO dynamically set to info for full test run
export LOG_LEVEL=info
export LOG_INCLUDE_LINES=true
export LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES=true

if npm list -g --depth=0 "c8" > /dev/null 2>&1; then
  c8 npm run test
else
  npm run test
  echo "c8 is not installed globally"
fi
