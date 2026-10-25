FROM nginx:1.27-alpine
COPY mobile/dist /usr/share/nginx/html
RUN chmod -R 755 /usr/share/nginx/html
EXPOSE 80
