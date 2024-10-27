import router from '@shared/routers/index.router';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Express, Request } from 'express';
dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

const allowedOrigins = process.env.CORSORIGIN?.split(',') || [];

const corsOptionsDelegate = (
  req: Request,
  callback: (error: any, options: cors.CorsOptions) => void,
) => {
  let corsOptions;
  if (allowedOrigins.includes(req.headers['origin'] ?? '')) {
    corsOptions = { origin: true }; // Reflect (enable) the requested origin in the CORS response
  } else {
    corsOptions = { origin: false }; // Disable CORS for this request
  }
  callback(null, corsOptions); // callback expects two parameters: error and options
};

app.use(cors(corsOptionsDelegate));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.options('*', cors(corsOptionsDelegate));

app.use('/api/v1/', router);

app.listen(port, () => {
  console.log(
    `[server]: Server is running at http://localhost:${port}/api/v1/`,
  );
});
