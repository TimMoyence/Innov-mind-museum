import { PassportStatic } from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { Strategy as JwtStrategy, ExtractJwt } from 'passport-jwt';
import bcrypt from 'bcrypt';
import { UserRepositoryPg } from './user.repository.pg';

const userRepository = new UserRepositoryPg();

export function configurePassport(passport: PassportStatic) {
  // Local Strategy pour le login
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

  // JWT Strategy pour protéger les routes
  passport.use(
    new JwtStrategy(
      {
        jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: process.env.JWT_SECRET || 'default_secret',
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

  // Si vous utilisez des sessions (pour le logout, par exemple)
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
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
