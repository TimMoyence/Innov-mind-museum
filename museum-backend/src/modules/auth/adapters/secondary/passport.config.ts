import { PassportStatic } from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcrypt';

import { env } from '@src/config/env';
import { UserRepositoryPg } from './user.repository.pg';

const userRepository = new UserRepositoryPg();

export function configurePassport(passport: PassportStatic) {
  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          const user = await userRepository.getUserByEmail(email);
          if (!user) {
            return done(null, false, {
              message: 'Email ou mot de passe incorrect.',
            });
          }
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return done(null, false, {
              message: 'Email ou mot de passe incorrect.',
            });
          }
          return done(null, user);
        } catch (error) {
          return done(error);
        }
      },
    ),
  );

  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: env.auth.jwtSecret,
      },
      async (jwtPayload, done) => {
        try {
          const user = await userRepository.getUserById(jwtPayload.id);
          if (!user) return done(null, false);
          return done(null, user);
        } catch (error) {
          return done(error, false);
        }
      },
    ),
  );

  passport.serializeUser((user: Express.User, done) => {
    const serialized = user as { id?: number };
    done(null, serialized.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await userRepository.getUserById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
}
