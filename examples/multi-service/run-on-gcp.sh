#if [ "$PROJECT_ID" = '' ]
#then
#  echo 'Missing PROJECT_ID env variable'
#  exit 1
#fi
#
#gcloud config set project "$PROJECT_ID"
#gcloud container clusters create micro-js --machine-type=f1-micro --num-nodes=3
#gcloud container clusters get-credentials micro-js
#gcloud components install kubectl

set -x
set -e

cd registry && docker build -t gcr.io/${PROJECT_ID}/registry .
gcloud docker -- push gcr.io/${PROJECT_ID}/registry
#kubectl run registry --image=gcr.io/${PROJECT_ID}/registry --port 10000
#kubectl expose deployment registry --type=LoadBalancer --port 10000 --target-port 10000

cd ../services/service1 && docker build -t gcr.io/${PROJECT_ID}/service1 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service1
#kubectl run service1 --image=gcr.io/${PROJECT_ID}/service1  --port 10001
#kubectl expose deployment service1 --type=LoadBalancer --port 10000 --target-port 10001

cd ../service2 && docker build -t gcr.io/${PROJECT_ID}/service2 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service2
#kubectl run service2 --image=gcr.io/${PROJECT_ID}/service2  --port 10002
#kubectl expose deployment service2 --type=LoadBalancer --port 10000 --target-port 10002

cd ../service3 && docker build -t gcr.io/${PROJECT_ID}/service3 .
gcloud docker -- push gcr.io/${PROJECT_ID}/service3
#kubectl run service3 --image=gcr.io/${PROJECT_ID}/service3  --port 10003
#kubectl expose deployment service3 --type=LoadBalancer --port 10000 --target-port 10003

cd ../..

kubectl create -f test-pod.yaml

exit 0
