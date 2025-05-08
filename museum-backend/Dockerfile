FROM node:23-bullseye


# Définir le répertoire de travail
WORKDIR /app

# Copier le fichier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm install

# Copier le reste de l'application
COPY . .

# Exposer le port utilisé par votre application
EXPOSE 3000

# Démarrer l'application (ajustez la commande si vous utilisez un build TypeScript)
CMD ["npm", "run", "start"]
