set -x
set -e

if [ "$PROJECT_ID" = '' ]
then
 echo 'Missing PROJECT_ID env variable'
 exit 1
fi

cd services/service1 && docker build -t gcr.io/${PROJECT_ID}/service1 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service1

cd ../service2 && docker build -t gcr.io/${PROJECT_ID}/service2 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service2

cd ../service3 && docker build -t gcr.io/${PROJECT_ID}/service3 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service3

cd ../..

kubectl create -f pod-services.yaml

exit 0
