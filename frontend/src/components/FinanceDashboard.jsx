"use strict";
import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { getFinanceAnalysis, getFinanceTrends, getFinanceSentiment } from '../api/financeApi';

const FinanceDashboard = ({ question }) => {
  const [analysisData, setAnalysisData] = useState(null);
  const [trendsData, setTrendsData] = useState(null);
  const [sentimentData, setSentimentData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Màu cho biểu đồ
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all finance data
        const [analysis, trends, sentiment] = await Promise.all([
          question ? getFinanceAnalysis(question) : getFinanceAnalysis("tóm tắt tài chính"),
          getFinanceTrends(),
          getFinanceSentiment()
        ]);

        setAnalysisData(analysis);
        setTrendsData(trends);
        setSentimentData(sentiment);
      } catch (err) {
        console.error("Error fetching finance data:", err);
        setError("Không thể tải dữ liệu tài chính. Vui lòng thử lại sau.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [question]);

  if (isLoading) {
    return <div className="p-4 text-gray-500">Đang tải dữ liệu tài chính...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">{error}</div>;
  }

  if (!analysisData) {
    return <div className="p-4 text-gray-500">Không có dữ liệu tài chính.</div>;
  }

  // Chuẩn bị dữ liệu cho biểu đồ
  const sentimentChartData = [
    { name: 'Tích cực', value: sentimentData?.sentiment_breakdown?.['tích cực'] || 0 },
    { name: 'Tiêu cực', value: sentimentData?.sentiment_breakdown?.['tiêu cực'] || 0 },
    { name: 'Trung tính', value: sentimentData?.sentiment_breakdown?.['trung tính'] || 0 }
  ];

  const trendsChartData = trendsData?.trends?.map((trend, index) => ({
    name: trend.keyword,
    value: trend.count,
    fill: COLORS[index % COLORS.length]
  })) || [];

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Phân tích tài chính</h2>

      {/* Summary Section */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Tóm tắt</h3>
        <p className="text-gray-700">{analysisData.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {analysisData.stocks?.length > 0 && (
            <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
              Mã CK: {analysisData.stocks.join(', ')}
            </div>
          )}
          {analysisData.companies?.length > 0 && (
            <div className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
              Công ty: {analysisData.companies.join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Sentiment Chart */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Cảm xúc thị trường</h3>
        <p className="text-sm text-gray-600 mb-3">
          Tổng quan: {sentimentData?.overall_sentiment} ({sentimentData?.recent_articles_count} bài phân tích)
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={sentimentChartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884D8"
              dataKey="value"
              nameKey="name"
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
            >
              {sentimentChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Trends Chart */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Xu hướng tài chính ({trendsData?.period_days} ngày gần đây)</h3>
        <p className="text-sm text-gray-600 mb-3">
          {trendsData?.total_articles} bài báo được phân tích
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendsChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" fill="#8884D8">
              {trendsChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default FinanceDashboard;