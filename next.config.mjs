/** @type {import('next').NextConfig} */
const nextConfig = {
	async redirects() {
		return [
			{
				source: "/",
				destination: "/dashboard",
				permanent: true, // 301 Redirect (SEO Friendly)
			},
		];
	},
};

export default nextConfig;
