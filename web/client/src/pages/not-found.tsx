import { Card, Result } from "antd";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <Result
          status="404"
          title="404 Page Not Found"
          subTitle="Did you forget to add the page to the router?"
        />
      </Card>
    </div>
  );
}
