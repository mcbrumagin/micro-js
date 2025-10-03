export MICRO_REGISTRY_URL=http://localhost:10000

if npm list -g --depth=0 "c8" > /dev/null 2>&1; then
  c8 npm run test
else
  npm run test
  echo "c8 is not installed globally"
fi
