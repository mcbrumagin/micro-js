export MICRO_REGISTRY_URL=http://localhost:11000
# export LOG_LEVEL=info

echo "setting up registry server at ${MICRO_REGISTRY_URL}"

if npm list -g --depth=0 "nodemon" > /dev/null 2>&1; then
  nodemon bootstrap.js
else
  echo "nodemon is not installed globally"
  node bootstrap.js
fi
