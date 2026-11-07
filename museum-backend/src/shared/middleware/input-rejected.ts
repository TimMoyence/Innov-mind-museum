import type { Response } from 'express';

export const markInputRejected = (res: Response, rejected: boolean): void => {
  res.locals.inputRejected = rejected;
};

export const onInputRejected = (res: Response, refund: () => void): void => {
  res.once('finish', () => {
    if (res.locals.inputRejected === true) refund();
  });
};
