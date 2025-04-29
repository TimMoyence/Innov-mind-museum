// src/app.ts
import router from '@shared/routers/index.router';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import 'reflect-metadata';
import { AppDataSource } from './data/db/data-source';
import { configurePassport } from './modules/auth/adapters/secondary/passport.config';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = process.env.CORSORIGIN?.split(',') || [];
const corsOptionsDelegate = (
  req: express.Request,
  callback: (error: any, options: cors.CorsOptions) => void,
) => {
  let corsOptions;
  if (allowedOrigins.includes(req.headers['origin'] ?? '')) {
    corsOptions = { origin: true };
  } else {
    corsOptions = { origin: false };
  }
  callback(null, corsOptions);
};

app.use(cors(corsOptionsDelegate));
app.options('*', cors(corsOptionsDelegate));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'session_secret',
    resave: false,
    saveUninitialized: false,
  }) as unknown as express.RequestHandler,
);

configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

app.use('/api/v1/', router);

// Initialisation de la connexion à la DB avec AppDataSource.initialize()
AppDataSource.initialize()
  .then(() => {
    app.listen(port, () => {
      console.log(
        `[server]: Server is running at http://localhost:${port}/api/v1/`,
      );
    });
  })
  .catch((error: any) => console.error('Erreur de connexion à la DB:', error));
