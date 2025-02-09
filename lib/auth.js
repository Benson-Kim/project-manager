import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export const authOptions = {
	adapter: PrismaAdapter(prisma),
	session: { strategy: "jwt" },
	pages: {
		signIn: "/auth/login",
		error: "/auth/error",
	},
	providers: [
		CredentialsProvider({
			name: "Credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials) {
				if (!credentials?.email || !credentials?.password) {
					throw new Error("Please enter an email and password");
				}

				const user = await prisma.user.findUnique({
					where: { email: credentials.email },
					select: {
						id: true,
						email: true,
						password: true,
						role: true,
						firstName: true,
						lastName: true,
					},
				});

				if (!user || !user.password) {
					throw new Error("No user found");
				}

				const isValid = await bcrypt.compare(
					credentials.password,
					user.password
				);

				if (!isValid) {
					throw new Error("Invalid password");
				}

				// Return user data with all necessary fields
				return {
					id: user.id,
					email: user.email,
					role: user.role,
					name: `${user.firstName} ${user.lastName}`,
				};
			},
		}),
	],
	callbacks: {
		async jwt({ token, user }) {
			if (user) {
				token.role = user.role;
				token.id = user.id;
			}
			return token;
		},
		async session({ session, token }) {
			if (token) {
				session.user.role = token.role;
				session.user.id = token.id;
			}
			return session;
		},
	},
};

export const auth = NextAuth(authOptions);
