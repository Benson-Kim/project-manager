// app/layout.js

import { Inter } from "next/font/google";
import "../styles/globals.css";
import Sidebar from "./layout/sidebar";
import Navbar from "./layout/Nav";
import { AuthProvider } from "@/components/AuthProvider";
import { Toaster } from "react-hot-toast";

const inter = Inter({ subsets: ["latin"] });

export default async function RootLayout({ children }) {
	return (
		<html lang="en">
			<body className={inter.className}>
				<AuthProvider>
					<main className="flex flex-col h-screen">
						<div className="flex flex-1 overflow-hidden">
							<Sidebar />
							<div className="flex-1 flex flex-col bg-slate-50">
								<Navbar />
								{children}
								<Toaster />
							</div>
						</div>
					</main>
				</AuthProvider>
			</body>
		</html>
	);
}
