// pages/unauthorized.js
export default function Unauthorized() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow text-center">
				<h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
				<p className="text-gray-600">
					You don't have permission to access this page.
				</p>
				<a
					href="/dashboard"
					className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
				>
					Return to Dashboard
				</a>
			</div>
		</div>
	);
}
