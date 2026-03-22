const fetch = require("node-fetch");

const BASE_URL = "https://5sim.net/v1";
const API_KEY = process.env.FIVESIM_API_KEY;

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  Accept: "application/json",
};

const fivesim = {

  async getBalance() {
    const res = await fetch(`${BASE_URL}/user/profile`, { headers });
    if (!res.ok) throw new Error("Impossible de récupérer le solde 5sim");
    const data = await res.json();
    return { balance: data.balance, email: data.email };
  },

  async getCountries(service) {
    const res = await fetch(`${BASE_URL}/guest/products/${service}/`, { headers });
    if (!res.ok) throw new Error("Service introuvable");
    const data = await res.json();
    return Object.entries(data).map(([countryCode, operators]) => {
      const opData = Object.values(operators)[0];
      return {
        code: countryCode,
        operator: Object.keys(operators)[0],
        cost: opData?.Cost || 0,
        count: opData?.Count || 0,
      };
    }).filter(c => c.count > 0);
  },

  async buyNumber(country, operator, service) {
    const url = `${BASE_URL}/user/buy/activation/${country}/${operator}/${service}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error("Achat impossible");
    return await res.json();
  },

  async checkSms(orderId) {
    const res = await fetch(`${BASE_URL}/user/check/${orderId}`, { headers });
    if (!res.ok) throw new Error("Commande introuvable");
    const data = await res.json();
    return {
      status: data.status,
      sms: data.sms || [],
      code: data.sms?.[0]?.code || null,
    };
  },

  async cancelOrder(orderId) {
    const res = await fetch(`${BASE_URL}/user/cancel/${orderId}`, { headers });
    if (!res.ok) throw new Error("Annulation impossible");
    return await res.json();
  },

  async finishOrder(orderId) {
    const res = await fetch(`${BASE_URL}/user/finish/${orderId}`, { headers });
    if (!res.ok) throw new Error("Finalisation impossible");
    return await res.json();
  },
};

module.exports = fivesim;
