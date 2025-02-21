/** @type {import('tailwindcss').Config} */
export default {
	content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],

	theme: {
		extend: {
			fontFamily: {
				sans: ["SF Pro Text", "Helvetica Neue", "sans-serif"],
			},
			colors: {
				primary: "var(--primary)",
				secondary: "var(--secondary)",
				background: "var(--background)",
				heading: "var(--heading)",
				body: "var(--body)",
				border: "var(--border)",
			},
		},
	},
	plugins: [require("daisyui")],
};
