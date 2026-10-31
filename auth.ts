import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { auth, handlers } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async session({session,token}) {
      if(session.user&&token.sub)(session.user as typeof session.user & {id?:string}).id=token.sub;
      return session;
    },
  },
  trustHost: true,
  pages: { signIn: "/" },
});
