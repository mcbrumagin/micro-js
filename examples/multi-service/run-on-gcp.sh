if [ "$PROJECT_ID" = '' ]
then
  echo 'Missing PROJECT_ID env variable'
  exit 1
fi

gcloud config set project "$PROJECT_ID"
gcloud config set compute/zone "us-east1-b"
gcloud container clusters create example --machine-type=f1-micro --num-nodes=3
gcloud container clusters get-credentials example
gcloud components install kubectl

cd registry && docker build -t gcr.io/${PROJECT_ID}/example/registry .
gcloud docker -- push gcr.io/${PROJECT_ID}/example/registry
kubectl run example-registry --image=gcr.io/${PROJECT_ID}/example/registry --port 10000
kubectl expose deployment example-registry --type=LoadBalancer --port 10000 --target-port 10000

cd ../service1 && docker build -t gcr.io/${PROJECT_ID}/example/service1 .
gcloud docker -- push gcr.io/${PROJECT_ID}/example/service1
kubectl run example-service1 --image=gcr.io/${PROJECT_ID}/example/service1  --port 10001
kubectl expose deployment example-service1 --type=LoadBalancer --port 10000 --target-port 10001

cd ../service2 && docker build -t gcr.io/${PROJECT_ID}/example/service2 .
gcloud docker -- push gcr.io/${PROJECT_ID}/example/service2
kubectl run example-service2 --image=gcr.io/${PROJECT_ID}/example/service2  --port 10002
kubectl expose deployment example-service2 --type=LoadBalancer --port 10000 --target-port 10002

cd ../service3 && docker build -t gcr.io/${PROJECT_ID}/example/service3 .
gcloud docker -- push gcr.io/${PROJECT_ID}/example/service3
kubectl run example-service3 --image=gcr.io/${PROJECT_ID}/example/service3  --port 10003
kubectl expose deployment example-service3 --type=LoadBalancer --port 10000 --target-port 10003

exit 0
