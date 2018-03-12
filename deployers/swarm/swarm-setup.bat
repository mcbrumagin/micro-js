docker-machine create swarm-manager ^
    --engine-install-url experimental.docker.com ^
    -d google ^
    --google-machine-type n1-standard-1 ^
    --google-tags swarm-cluster ^
    --google-project micro-188415