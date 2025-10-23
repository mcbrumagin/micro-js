export MICRO_REGISTRY_URL=http://localhost:11000

export ADMIN_USER=admin
export ADMIN_SECRET=password

export LOG_LEVEL=info
export LOG_INCLUDE_LINES=true
export LOG_EXCLUDE_FULL_PATH_IN_LOG_LINES=true

echo "setting up registry server at ${MICRO_REGISTRY_URL}"

if npm list -g --depth=0 "nodemon" > /dev/null 2>&1; then
  nodemon bootstrap.js
else
  echo "nodemon is not installed globally"
  node bootstrap.js
fi
