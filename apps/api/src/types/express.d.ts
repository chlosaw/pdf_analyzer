declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth */
      userId?: string;
      /** Set by requireAuth, read fresh from the database on every request (so a demotion applies at once) */
      userRole?: import('@prisma/client').Role;
    }
  }
}

export {};
