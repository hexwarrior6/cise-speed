import type { GetServerSideProps } from "next";
export const getServerSideProps: GetServerSideProps = async () => ({ redirect: { destination: "/submit", permanent: false } });
export default function LegacySubmissionPage() { return null; }
