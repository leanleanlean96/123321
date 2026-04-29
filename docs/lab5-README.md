# Лабораторная работа №5: Kubernetes

## Приложение

TODO-приложение: **frontend** (Node.js, порт 3000) + **backend** (Node.js/Express, порт 8080) + **PostgreSQL** (порт 5432).

## Структура манифестов

```
k8s/kustomization/
  base/
    configmap.yaml          # Конфигурация: PORT, HOST, API_URL
    backend-deployment.yaml # Deployment backend, читает ConfigMap и Secret
    frontend-deployment.yaml
    backend-service.yaml    # ClusterIP :8080
    frontend-service.yaml   # ClusterIP :80
    ingress.yaml            # Ingress: todo.local → frontend/backend
    hpa-backend.yaml        # HPA: CPU 50%, Memory 70%, min 1 / max 5 реплик
  overlays/
    dev/
      namespace.yaml        # Namespace todo-demo
      secret.yaml           # DATABASE_URL для dev
      patch-replicas.yaml   # replicas: 1
      patch-configmap.yaml  # API_URL: http://localhost:8080
    prod/
      namespace.yaml        # Namespace todo-prod
      secret.yaml           # DATABASE_URL с FQDN
      patch-resources.yaml  # replicas: 3, увеличенные ресурсы
infra/postgres/k8s/kustomization/
  base/
    postgres-statefulset.yaml  # StatefulSet + volumeClaimTemplates
    postgres-service.yaml      # Headless Service (clusterIP: None)
  overlays/dev/               # namespace todo-demo, 1 Gi, dev-пароли
  overlays/prod/              # namespace todo-demo, 10 Gi
```

## Развертка приложения:

### 1. Собрать образы

```bash
docker build -t todo-backend:latest ./backend
docker build -t todo-frontend:latest ./frontend
```

### 2. Установить Nginx Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx && helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=NodePort \
  --set controller.service.nodePorts.http=30080
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s
```

### 3. Установить Metrics Server (нужен для HPA)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system \
  --patch-file observability/k8s/metrics-server-patch.yaml
kubectl wait --namespace kube-system \
  --for=condition=ready pod \
  --selector=k8s-app=metrics-server \
  --timeout=120s
```

### 4. Развернуть PostgreSQL

```bash
kubectl apply -k infra/postgres/k8s/kustomization/overlays/dev
kubectl wait --namespace todo-demo \
  --for=condition=ready pod \
  --selector=app=postgres --timeout=120s
```

### 5. Развернуть приложение

```bash
kubectl apply -k k8s/kustomization/overlays/dev
kubectl wait --namespace todo-demo \
  --for=condition=ready pod \
  --selector=app=todo-app,component=backend --timeout=120s
```

### 6. Добавить домен и проверить

```bash
echo "127.0.0.1 todo.local" | sudo tee -a /etc/hosts
```

Открыть в браузере: **http://todo.local:30080**

---

## ConfigMap и Secret

ConfigMap `todo-config` хранит нечувствительную конфигурацию (PORT, HOST, API\_URL).
Secret `todo-secrets` хранит `DATABASE_URL`. Оба монтируются в Deployment через `envFrom` / `valueFrom`.

---

## Ingress

Ingress`todo-ingress` маршрутизирует:

- `todo.local/api/*` → Service `todo-backend:8080`
- `todo.local/health` → Service `todo-backend:8080`
- `todo.local/` → Service `todo-frontend:80`

```bash
kubectl get ingress -n todo-demo
kubectl describe ingress todo-ingress -n todo-demo
```

---

## Мониторинг и логирование

Backend отдаёт метрики на `/metrics` (prom-client).

```bash
# Метрики backend
kubectl port-forward svc/todo-backend 8080:8080 -n todo-demo &
curl http://localhost:8080/metrics | grep -E "^(http_requests_total|todos_)"
kill %1
```

---

## Horizontal Pod Autoscaler

HPA `todo-backend-hpa` масштабирует Deployment `todo-backend` от 1 до 5 реплик при CPU > 50% или Memory > 70%.

```bash
kubectl get hpa -n todo-demo
kubectl top pods -n todo-demo

# Создать нагрузку
kubectl run load-generator --image=busybox:1.36 --restart=Never \
  --namespace=todo-demo \
  -- /bin/sh -c "while true; do wget -q -O- http://todo-backend:8080/api/todos > /dev/null; done"

# Наблюдать масштабирование
kubectl get hpa todo-backend-hpa -n todo-demo -w

# Остановить нагрузку
kubectl delete pod load-generator -n todo-demo
```

---

## Масштабирование и обновление

```bash
# Масштабировать вручную
kubectl scale deployment todo-backend --replicas=3 -n todo-demo
kubectl get pods -n todo-demo -w

# Rolling update
docker tag todo-backend:latest todo-backend:v2
kubectl set image deployment/todo-backend backend=todo-backend:v2 -n todo-demo
kubectl rollout status deployment/todo-backend -n todo-demo

# Откат
kubectl rollout undo deployment/todo-backend -n todo-demo

# Удалить всё
kubectl delete -k k8s/kustomization/overlays/dev
kubectl delete -k infra/postgres/k8s/kustomization/overlays/dev
```
