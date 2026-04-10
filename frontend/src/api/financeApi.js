import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export async function getFinanceAnalysis(question, filters = {}) {
  const response = await axios.post(`${API_BASE_URL}/finance/analysis`, {
    question,
    filters,
  });
  return response.data;
}

export async function getFinanceTrends(days = 7) {
  const response = await axios.get(`${API_BASE_URL}/finance/trends`, {
    params: { days },
  });
  return response.data;
}

export async function getFinanceSentiment() {
  const response = await axios.post(`${API_BASE_URL}/finance/sentiment`);
  return response.data;
}
