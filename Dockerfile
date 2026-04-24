# Статичний сайт: document root = app/ (як у require-auth.js і render.yaml).
# Збірка: docker build -t ad-diag .
# Запуск:  docker run --rm -p 8080:80 ad-diag  → http://localhost:8080/index.html
FROM nginx:1.27-alpine
COPY app/ /usr/share/nginx/html/
