set -x
set -e

if [ "$PROJECT_ID" = '' ]
then
 echo 'Missing PROJECT_ID env variable'
 exit 1
fi

cd registry && docker build -t gcr.io/${PROJECT_ID}/registry .
gcloud docker -- push gcr.io/${PROJECT_ID}/registry

cd ..

kubectl create -f pod-registry.yaml

kubectl expose pod registry --type=LoadBalancer --port 10000 --target-port 10000

exit 0
