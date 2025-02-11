// app/layout.js

import "../styles/globals.css";
import Navbar from "./layout/Nav";
import Sidebar from "./layout/sidebar";
import { Toaster } from "react-hot-toast";
import { Open_Sans, Domine } from "next/font/google";
import { AuthProvider } from "@/components/AuthProvider";

const openSans = Open_Sans({
	subsets: ["latin"],
	variable: "--font-open-sans",
});

const domine = Domine({
	subsets: ["latin"],
	variable: "--font-domine",
});

export default async function RootLayout({ children }) {
	return (
		<html lang="en">
			<body className={`${openSans.variable} ${domine.variable}`}>
				<AuthProvider>
					<main className="flex flex-col h-screen">
						<div className="flex flex-1 overflow-hidden">
							<Sidebar />
							<div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
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
