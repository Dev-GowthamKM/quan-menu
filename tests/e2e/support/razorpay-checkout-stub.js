// Stands in for https://checkout.razorpay.com/v1/checkout.js in end-to-end tests. Instead
// of showing Razorpay's payment window it asks the mock API to "pay" the order, then calls
// the same success/failure callbacks Razorpay Checkout would. The outcome comes from
// window.__RZP_OUTCOME ("captured" | "failed" | "dismiss").
(function () {
  function Razorpay(options) {
    this.options = options;
    this.handlers = {};
  }
  Razorpay.prototype.on = function (event, cb) {
    this.handlers[event] = cb;
  };
  Razorpay.prototype.open = function () {
    var self = this;
    var outcome = window.__RZP_OUTCOME || "captured";
    window.__RZP_OPENED = (window.__RZP_OPENED || 0) + 1;
    if (outcome === "dismiss") {
      setTimeout(function () { self.options.modal && self.options.modal.ondismiss && self.options.modal.ondismiss(); }, 50);
      return;
    }
    fetch((window.__RZP_MOCK || "http://127.0.0.1:4010") + "/__test/pay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order_id: self.options.order_id, outcome: outcome, method: (self.options.prefill && self.options.prefill.method) || "upi" }),
    })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        if (outcome === "failed") {
          self.handlers["payment.failed"] && self.handlers["payment.failed"]({
            error: { code: "BAD_REQUEST_ERROR", description: "Payment declined by the bank (mock)", metadata: { payment_id: r.razorpay_payment_id, order_id: r.razorpay_order_id } },
          });
        } else {
          self.options.handler({ razorpay_payment_id: r.razorpay_payment_id, razorpay_order_id: r.razorpay_order_id, razorpay_signature: r.razorpay_signature });
        }
      });
  };
  window.Razorpay = Razorpay;
})();
