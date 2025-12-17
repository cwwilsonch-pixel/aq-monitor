export function requireRole(role) {
    return (req, res, next) => {
        const user = req.user;
        if (!user)
            return res.status(401).end();
        const roles = user.roles || [];
        if (!roles.includes(role))
            return res.status(403).end();
        next();
    };
}
