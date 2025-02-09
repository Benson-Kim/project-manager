// app/auth/reset-password/page.js
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPassword() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const token = searchParams.get("token");

	const [formData, setFormData] = useState({
		password: "",
		confirmPassword: "",
	});
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleChange = (e) => {
		setFormData({
			...formData,
			[e.target.name]: e.target.value,
		});
	};

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setError("");

		if (formData.password !== formData.confirmPassword) {
			setError("Passwords do not match");
			setLoading(false);
			return;
		}

		try {
			const res = await fetch("/api/auth/reset-password", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					token,
					password: formData.password,
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.message || "Failed to reset password");
			}

			router.push(
				"/auth/signin?message=Password reset successful! Please sign in."
			);
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	if (!token) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center text-red-600">
					Invalid or missing reset token
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
			<div className="max-w-md w-full space-y-8">
				<div>
					<h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
						Reset your password
					</h2>
				</div>
				{error && (
					<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
						{error}
					</div>
				)}
				<form className="mt-8 space-y-6" onSubmit={handleSubmit}>
					<div className="rounded-md shadow-sm space-y-4">
						<div>
							<label htmlFor="password" className="sr-only">
								New Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								required
								className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
								placeholder="New Password"
								value={formData.password}
								onChange={handleChange}
							/>
						</div>
						<div>
							<label htmlFor="confirmPassword" className="sr-only">
								Confirm New Password
							</label>
							<input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								required
								className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
								placeholder="Confirm New Password"
								value={formData.confirmPassword}
								onChange={handleChange}
							/>
						</div>
					</div>

					<div>
						<button
							type="submit"
							disabled={loading}
							className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
						>
							{loading ? "Resetting password..." : "Reset password"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
