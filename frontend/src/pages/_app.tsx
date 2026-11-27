import "../styles/globals.scss";
import type { AppProps } from "next/app";
import PopulatedNavBar from "../components/PopulatedNavBar";
import { AuthProvider } from "../contexts/AuthContext";

function MyApp({ Component, pageProps }: AppProps) {
  return (
      <AuthProvider>
        <PopulatedNavBar />
        <Component {...pageProps} />
      </AuthProvider>
  );
}

export default MyApp;
