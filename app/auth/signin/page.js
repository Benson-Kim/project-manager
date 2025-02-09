// app/auth/login/page.js
"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
	const router = useRouter();
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [mode, setMode] = useState("login"); // login, register, reset
	const [resetEmailSent, setResetEmailSent] = useState(false);

	const handleLogin = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		const formData = new FormData(e.currentTarget);
		const response = await signIn("credentials", {
			email: formData.get("email"),
			password: formData.get("password"),
			redirect: false,
		});

		if (response?.error) {
			setError(response.error);
			setIsLoading(false);
		} else {
			router.push("/dashboard");
		}
	};

	const handleRegister = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		const formData = new FormData(e.currentTarget);
		const data = {
			email: formData.get("email"),
			password: formData.get("password"),
			firstName: formData.get("firstName"),
			lastName: formData.get("lastName"),
			departmentOrOrganization: formData.get("department"),
		};

		try {
			const response = await fetch("/api/auth/register", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});

			if (response.ok) {
				setMode("login");
			} else {
				const error = await response.json();
				setError(error.message);
			}
		} catch (error) {
			setError("Something went wrong. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const handleResetPassword = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		setError("");

		const formData = new FormData(e.currentTarget);
		const email = formData.get("email");

		try {
			const response = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email }),
			});

			if (response.ok) {
				setResetEmailSent(true);
			} else {
				const error = await response.json();
				setError(error.message);
			}
		} catch (error) {
			setError("Something went wrong. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	const renderLoginForm = () => (
		<form className="mt-8 space-y-6" onSubmit={handleLogin}>
			<div>
				<label
					htmlFor="email"
					className="block text-sm font-medium text-gray-700"
				>
					Email address
				</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
				/>
			</div>
			<div>
				<label
					htmlFor="password"
					className="block text-sm font-medium text-gray-700"
				>
					Password
				</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
				/>
			</div>
			<button
				type="submit"
				disabled={isLoading}
				className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md text-white bg-blue-600 hover:bg-blue-700"
			>
				{isLoading ? "Signing in..." : "Sign in"}
			</button>
			<div className="flex justify-between text-sm">
				<button
					type="button"
					onClick={() => setMode("register")}
					className="text-blue-600 hover:text-blue-500"
				>
					Create an account
				</button>
				<button
					type="button"
					onClick={() => setMode("reset")}
					className="text-blue-600 hover:text-blue-500"
				>
					Forgot password?
				</button>
			</div>
		</form>
	);

	const renderRegisterForm = () => (
		<form className="mt-8 space-y-6" onSubmit={handleRegister}>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<label
						htmlFor="firstName"
						className="block text-sm font-medium text-gray-700"
					>
						First Name
					</label>
					<input
						id="firstName"
						name="firstName"
						type="text"
						required
						className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
					/>
				</div>
				<div>
					<label
						htmlFor="lastName"
						className="block text-sm font-medium text-gray-700"
					>
						Last Name
					</label>
					<input
						id="lastName"
						name="lastName"
						type="text"
						required
						className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
					/>
				</div>
			</div>
			<div>
				<label
					htmlFor="email"
					className="block text-sm font-medium text-gray-700"
				>
					Email address
				</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
				/>
			</div>
			<div>
				<label
					htmlFor="password"
					className="block text-sm font-medium text-gray-700"
				>
					Password
				</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
				/>
			</div>
			<div>
				<label
					htmlFor="department"
					className="block text-sm font-medium text-gray-700"
				>
					Department/Organization
				</label>
				<input
					id="department"
					name="department"
					type="text"
					className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
				/>
			</div>
			<button
				type="submit"
				disabled={isLoading}
				className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md text-white bg-blue-600 hover:bg-blue-700"
			>
				{isLoading ? "Creating account..." : "Create account"}
			</button>
			<div className="text-center">
				<button
					type="button"
					onClick={() => setMode("login")}
					className="text-blue-600 hover:text-blue-500 text-sm"
				>
					Already have an account? Sign in
				</button>
			</div>
		</form>
	);

	const renderResetForm = () => (
		<form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
			{resetEmailSent ? (
				<div className="text-center space-y-4">
					<p className="text-green-600">
						Reset password link has been sent to your email.
					</p>
					<button
						type="button"
						onClick={() => {
							setMode("login");
							setResetEmailSent(false);
						}}
						className="text-blue-600 hover:text-blue-500"
					>
						Return to login
					</button>
				</div>
			) : (
				<>
					<div>
						<label
							htmlFor="email"
							className="block text-sm font-medium text-gray-700"
						>
							Email address
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
						/>
					</div>
					<button
						type="submit"
						disabled={isLoading}
						className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md text-white bg-blue-600 hover:bg-blue-700"
					>
						{isLoading ? "Sending..." : "Send reset link"}
					</button>
					<div className="text-center">
						<button
							type="button"
							onClick={() => setMode("login")}
							className="text-blue-600 hover:text-blue-500 text-sm"
						>
							Back to login
						</button>
					</div>
				</>
			)}
		</form>
	);

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
				<h2 className="text-3xl font-bold text-center">
					{mode === "login" && "Sign in to your account"}
					{mode === "register" && "Create an account"}
					{mode === "reset" && "Reset your password"}
				</h2>
				{error && (
					<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
						{error}
					</div>
				)}
				{mode === "login" && renderLoginForm()}
				{mode === "register" && renderRegisterForm()}
				{mode === "reset" && renderResetForm()}
			</div>
		</div>
	);
}
