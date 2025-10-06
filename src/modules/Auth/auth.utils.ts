import jwt, { JwtPayload } from 'jsonwebtoken';

export const createToken = (
    jwtPayload: { email: string; userId: string; role: string, },
    secret: string,
    expiresIn: any,
) => {
    return jwt.sign(jwtPayload, secret, {
        expiresIn,
    });
};

export const verifyToken = (token: string, secret: string) => {
    return jwt.verify(token, secret) as JwtPayload;
};