# Panel "Amigos" (Camino A). El contexto de build es la raíz del repo openGym, porque
# el agregador reutiliza los módulos puros del frontend (e1RM, volumen, semana, catálogo)
# en lugar de duplicar la lógica.
#
#   docker build -f friends/Dockerfile -t opengym-friends .
FROM node:22-alpine

WORKDIR /app
COPY friends/ /app/friends/
COPY frontend/src/lib/ /app/frontend/src/lib/

ENV OPENGYM_DATA=/app/data
EXPOSE 8770

WORKDIR /app/friends
CMD ["node", "server.js"]
