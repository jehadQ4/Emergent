"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const EMPTY_FORM = {
  drugName: "",
  category: "",
  quantity: "",
  minimumQuantity: "",
  price: "",
  expiryDate: "",
};

export default function InventorySheetTab({ authedFetch }) {
  const [medicines, setMedicines] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [stockAmounts, setStockAmounts] = useState({});

  const [loading, setLoading] = useState(true);
  const [busyMedicine, setBusyMedicine] = useState(null);
  const [error, setError] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [addingMedicine, setAddingMedicine] = useState(false);
  const [newMedicine, setNewMedicine] = useState(EMPTY_FORM);

 const fetchMedicines = useCallback(async () => {
  try {
    setLoading(true);
    setError("");

    const response = await authedFetch("/api/inventory/source", {
      method: "GET",
      cache: "no-store",
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(
        responseText ||
          `فشل جلب البيانات: ${response.status}`
      );
    }

    if (!responseText.trim()) {
      throw new Error("وصل رد فارغ من n8n");
    }

    const result = JSON.parse(responseText);

    let rows = [];

    if (Array.isArray(result)) {
      rows = result;
    } else if (Array.isArray(result.data)) {
      rows = result.data;
    } else if (Array.isArray(result.body)) {
      rows = result.body;
    } else if (
      result &&
      typeof result === "object" &&
      Object.keys(result).length > 0
    ) {
      rows = [result];
    }

    setMedicines(rows);
  } catch (fetchError) {
    console.error("خطأ في جلب الأدوية:", fetchError);
    setError(fetchError.message || "تعذر جلب الأدوية");
    setMedicines([]);
  } finally {
    setLoading(false);
  }
}, [authedFetch]);

  useEffect(() => {
    fetchMedicines();
  }, [fetchMedicines]);

  const filteredMedicines = useMemo(() => {
    const search = normalizeText(searchTerm);

    if (!search) {
      return medicines;
    }

    return medicines.filter((medicine) => {
      const name = normalizeText(medicine["اسم الدواء"]);
      const category = normalizeText(medicine["التصنيف"]);

      return name.includes(search) || category.includes(search);
    });
  }, [medicines, searchTerm]);

  const handleStockAmountChange = (medicineKey, value) => {
    setStockAmounts((current) => ({
      ...current,
      [medicineKey]: value,
    }));
  };

  const handleStockUpdate = async (medicine, operation) => {
    const medicineKey = getMedicineKey(medicine);
    const drugName = medicine["اسم الدواء"];
    const currentQuantity = toNumber(medicine["الكمية"]);

    const enteredQuantity = Number(
      stockAmounts[medicineKey] ?? 1
    );

    if (
      !Number.isInteger(enteredQuantity) ||
      enteredQuantity <= 0
    ) {
      toast.error("أدخل كمية صحيحة أكبر من صفر");
      return;
    }

    if (
      operation === "dispense" &&
      enteredQuantity > currentQuantity
    ) {
      toast.error(`الكمية المتوفرة هي ${currentQuantity} فقط`);
      return;
    }

    const newQuantity =
      operation === "add"
        ? currentQuantity + enteredQuantity
        : currentQuantity - enteredQuantity;

    const operationText =
      operation === "add" ? "إضافة" : "صرف";

    const confirmed = window.confirm(
  `${operationText} ${enteredQuantity} من ${drugName}؟`
);

    if (!confirmed) {
      return;
    }

    try {
      setBusyMedicine(medicineKey);

      const response = await authedFetch("/api/inventory/stock", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          row_number: medicine.row_number,
          drug_code: medicine["رمز الدواء"],
          drug_name: drugName,
          qty: enteredQuantity,
          current_quantity: currentQuantity,
          new_quantity: newQuantity,
          action: operation,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          responseText || `فشل تحديث المخزون: ${response.status}`
        );
      }

      toast.success(`تمت ${operationText} ${enteredQuantity} من ${drugName}`);

      setStockAmounts((current) => ({
        ...current,
        [medicineKey]: 1,
      }));

      await fetchMedicines();
    } catch (updateError) {
      console.error("خطأ في تحديث المخزون:", updateError);
      toast.error(updateError.message || "تعذر تحديث المخزون");
    } finally {
      setBusyMedicine(null);
    }
  };

  const handleDeleteMedicine = async (medicine) => {
    const medicineKey = getMedicineKey(medicine);
    const drugName = medicine["اسم الدواء"];
    const rowNumber = medicine.row_number;

    if (!rowNumber) {
      toast.error("رقم صف الدواء غير موجود");
      return;
    }

    const confirmed = window.confirm(
      `هل أنت متأكد من حذف دواء "${drugName}" بالكامل؟\n\n` +
        "لا يمكن التراجع عن هذا الإجراء."
    );

    if (!confirmed) {
      return;
    }

    try {
      setBusyMedicine(medicineKey);

      const response = await authedFetch("/api/inventory/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          row_number: rowNumber,
          drug_code: medicine["رمز الدواء"],
          drug_name: drugName,
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          responseText || `فشل حذف الدواء: ${response.status}`
        );
      }

      toast.success(`تم حذف ${drugName} بالكامل`);
      await fetchMedicines();
    } catch (deleteError) {
      console.error("خطأ في حذف الدواء:", deleteError);
      toast.error(deleteError.message || "تعذر حذف الدواء");
    } finally {
      setBusyMedicine(null);
    }
  };

  const handleNewMedicineChange = (event) => {
    const { name, value } = event.target;

    setNewMedicine((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleAddMedicine = async (event) => {
    event.preventDefault();

    const drugName = newMedicine.drugName.trim();
    const category = newMedicine.category.trim();
    const quantity = Number(newMedicine.quantity);
    const minimumQuantity = Number(
      newMedicine.minimumQuantity || 20
    );
    const price = Number(newMedicine.price || 0);

    if (!drugName) {
      toast.error("اكتب اسم الدواء");
      return;
    }

    if (!category) {
      toast.error("اختر التصنيف");
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      toast.error("أدخل كمية صحيحة");
      return;
    }

    if (
      !Number.isInteger(minimumQuantity) ||
      minimumQuantity < 0
    ) {
      toast.error("أدخل حدًا أدنى صحيحًا");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      toast.error("أدخل سعرًا صحيحًا");
      return;
    }

    if (!newMedicine.expiryDate) {
      toast.error("اختر تاريخ الانتهاء");
      return;
    }

    const highestCode = medicines.reduce(
      (highest, medicine) => {
        const code = Number(medicine["رمز الدواء"]) || 0;
        return Math.max(highest, code);
      },
      0
    );

    const newDrugCode = highestCode + 1;

    try {
      setAddingMedicine(true);

      const response = await authedFetch("/api/inventory/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          drug_code: newDrugCode,
          drug_name: drugName,
          category,
          expiry_date: newMedicine.expiryDate,
          quantity,
          minimum_quantity: minimumQuantity,
          price,
          total_value: quantity * price,
          status: quantity > 0 ? "متوفر" : "غير متوفر",
        }),
      });

      const responseText = await response.text();

      if (!response.ok) {
        throw new Error(
          responseText || `فشل إضافة الدواء: ${response.status}`
        );
      }

      toast.success(`تمت إضافة ${drugName} بنجاح`);

      setNewMedicine(EMPTY_FORM);
      setShowAddForm(false);

      await fetchMedicines();
    } catch (addError) {
      console.error("خطأ في إضافة الدواء:", addError);
      toast.error(addError.message || "تعذر إضافة الدواء");
    } finally {
      setAddingMedicine(false);
    }
  };

  return (
    <main className="page">
      <section className="container">
        <header className="header">
          <div>
            <h1>إدارة مخزن صيدلية الغسق</h1>
            <p>عرض الأدوية وتحديث كميات المخزن</p>
          </div>

          <div className="headerButtons">
            <button
              type="button"
              className="primaryButton"
              onClick={() => setShowAddForm(true)}
            >
              + إضافة دواء جديد
            </button>

            <button
              type="button"
              className="secondaryButton"
              onClick={fetchMedicines}
              disabled={loading}
            >
              {loading ? "جاري التحديث..." : "تحديث البيانات"}
            </button>
          </div>
        </header>

        <div className="searchSection">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) =>
              setSearchTerm(event.target.value)
            }
            placeholder="ابحث باسم الدواء أو التصنيف..."
          />

          <span className="resultCount">
            عدد النتائج: {filteredMedicines.length}
          </span>
        </div>

        {loading ? (
          <div className="messageBox">
            جاري تحميل الأدوية...
          </div>
        ) : error ? (
          <div className="messageBox errorBox">
            <p>{error}</p>

            <button
              type="button"
              className="primaryButton"
              onClick={fetchMedicines}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="messageBox">
            لا توجد أدوية مطابقة للبحث.
          </div>
        ) : (
          <div className="tableWrapper">
            <table>
              <thead>
                <tr>
                  <th>الرمز</th>
                  <th>اسم الدواء</th>
                  <th>التصنيف</th>
                  <th>الكمية</th>
                  <th>الحد الأدنى</th>
                  <th>السعر</th>
                  <th>تاريخ الانتهاء</th>
                  <th>التنبيهات</th>
                  <th>الكمية المطلوبة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>

              <tbody>
                {filteredMedicines.map((medicine, index) => {
                  const medicineKey =
                    getMedicineKey(medicine) || index;

                  const drugName =
                    medicine["اسم الدواء"] || "من دون اسم";

                  const quantity = toNumber(
                    medicine["الكمية"]
                  );

                  const minimumQuantity =
                    medicine["الحد الأدنى"] === undefined ||
                    medicine["الحد الأدنى"] === ""
                      ? 20
                      : toNumber(medicine["الحد الأدنى"]);

                  const price = toNumber(medicine["السعر"]);
                  const expiryDate =
                    medicine["تاريخ الانتهاء"];

                  const stockIsLow =
                    quantity <= minimumQuantity;

                  const expiryStatus =
                    getExpiryStatus(expiryDate);

                  const enteredAmount =
                    stockAmounts[medicineKey] ?? 1;

                  const numericAmount = Number(enteredAmount);

                  const isBusy = busyMedicine === medicineKey;

                  const invalidAmount =
                    !Number.isInteger(numericAmount) ||
                    numericAmount <= 0;

                  const cannotAdd = isBusy || invalidAmount;

                  const cannotDispense =
                    isBusy ||
                    invalidAmount ||
                    numericAmount > quantity ||
                    expiryStatus === "expired";

                  return (
                    <tr key={`${medicineKey}-${index}`}>
                      <td>
                        {medicine["رمز الدواء"] || "—"}
                      </td>

                      <td className="medicineName">
                        {drugName}
                      </td>

                      <td>
                        {medicine["التصنيف"] || "غير محدد"}
                      </td>

                      <td
                        className={
                          stockIsLow
                            ? "lowQuantity"
                            : "goodQuantity"
                        }
                      >
                        {quantity}
                      </td>

                      <td>{minimumQuantity}</td>

                      <td>{formatNumber(price)} د.ع</td>

                      <td>{formatDate(expiryDate)}</td>

                      <td>
                        <div className="badges">
                          {stockIsLow && (
                            <span className="badge lowBadge">
                              ⚠️ كمية منخفضة
                            </span>
                          )}

                          {expiryStatus === "soon" && (
                            <span className="badge soonBadge">
                              ⏳ قريب الانتهاء
                            </span>
                          )}

                          {expiryStatus === "expired" && (
                            <span className="badge expiredBadge">
                              ⛔ منتهي
                            </span>
                          )}

                          {!stockIsLow &&
                            expiryStatus === "valid" && (
                              <span className="badge validBadge">
                                متوفر
                              </span>
                            )}
                        </div>
                      </td>

                      <td>
                        <input
                          className="quantityInput"
                          type="number"
                          min="1"
                          step="1"
                          value={enteredAmount}
                          disabled={isBusy}
                          onChange={(event) =>
                            handleStockAmountChange(
                              medicineKey,
                              event.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <div className="actionButtons">
                          <button
                            type="button"
                            className="addStockButton"
                            onClick={() =>
                              handleStockUpdate(medicine, "add")
                            }
                            disabled={cannotAdd}
                          >
                            {isBusy ? "..." : "إضافة"}
                          </button>

                          <button
                            type="button"
                            className="dispenseButton"
                            onClick={() =>
                              handleStockUpdate(
                                medicine,
                                "dispense"
                              )
                            }
                            disabled={cannotDispense}
                          >
                            {isBusy ? "..." : "صرف"}
                          </button>

                          <button
                            type="button"
                            className="deleteButton"
                            onClick={() =>
                              handleDeleteMedicine(medicine)
                            }
                            disabled={isBusy}
                          >
                            {isBusy ? "..." : "حذف"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showAddForm && (
        <div
          className="modalOverlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowAddForm(false);
            }
          }}
        >
          <form
            className="medicineForm"
            onSubmit={handleAddMedicine}
          >
            <div className="formHeader">
              <div>
                <h2>إضافة دواء جديد</h2>
                <p>أدخل معلومات الدواء لإضافته إلى المخزن</p>
              </div>

              <button
                type="button"
                className="closeButton"
                onClick={() => setShowAddForm(false)}
              >
                ×
              </button>
            </div>

            <div className="formGrid">
              <label className="fullWidth">
                <span>اسم الدواء</span>
                <input
                  type="text"
                  name="drugName"
                  value={newMedicine.drugName}
                  onChange={handleNewMedicineChange}
                  placeholder="مثال: امبرازول حب"
                  required
                />
              </label>

              <label>
                <span>التصنيف</span>

                <select
                  name="category"
                  value={newMedicine.category}
                  onChange={handleNewMedicineChange}
                  required
                >
                  <option value="">اختر التصنيف</option>
                  <option value="أقراص">أقراص</option>
                  <option value="شراب">شراب</option>
                  <option value="إبر">إبر</option>
                  <option value="كبسول">كبسول</option>
                  <option value="قطرة">قطرة</option>
                  <option value="فوار">فوار</option>
                  <option value="مرهم">مرهم</option>
                  <option value="كريم">كريم</option>
                  <option value="تحاميل">تحاميل</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </label>

              <label>
                <span>تاريخ الانتهاء</span>
                <input
                  type="date"
                  name="expiryDate"
                  value={newMedicine.expiryDate}
                  onChange={handleNewMedicineChange}
                  required
                />
              </label>

              <label>
                <span>الكمية</span>
                <input
                  type="number"
                  name="quantity"
                  min="0"
                  step="1"
                  value={newMedicine.quantity}
                  onChange={handleNewMedicineChange}
                  required
                />
              </label>

              <label>
                <span>الحد الأدنى</span>
                <input
                  type="number"
                  name="minimumQuantity"
                  min="0"
                  step="1"
                  value={newMedicine.minimumQuantity}
                  onChange={handleNewMedicineChange}
                  placeholder="20"
                />
              </label>

              <label className="fullWidth">
                <span>سعر الوحدة</span>
                <input
                  type="number"
                  name="price"
                  min="0"
                  step="0.01"
                  value={newMedicine.price}
                  onChange={handleNewMedicineChange}
                />
              </label>
            </div>

            <div className="formActions">
              <button
                type="button"
                className="cancelButton"
                onClick={() => setShowAddForm(false)}
              >
                إلغاء
              </button>

              <button
                type="submit"
                className="saveButton"
                disabled={addingMedicine}
              >
                {addingMedicine
                  ? "جاري حفظ الدواء..."
                  : "حفظ الدواء"}
              </button>
            </div>
          </form>
        </div>
      )}

      <style jsx>{`
        :global(*) {
          box-sizing: border-box;
        }

        .page {
          min-height: auto;
          padding: 0;
          direction: rtl;
          font-family: Arial, sans-serif;
          background: transparent;
          color: #26232d;
        }

        .container {
          max-width: 1500px;
          margin: 0 auto;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 18px;
          margin-bottom: 22px;
        }

        .header h1 {
          margin: 0 0 8px;
          color: #655d90;
        }

        .header p {
          margin: 0;
          color: #6c6877;
        }

        .headerButtons,
        .actionButtons {
          display: flex;
          justify-content: center;
          gap: 7px;
        }

        button {
          font-family: inherit;
        }

        .primaryButton,
        .secondaryButton {
          padding: 12px 20px;
          border: 0;
          border-radius: 9px;
          color: white;
          cursor: pointer;
        }

        .primaryButton {
          background: #655d90;
        }

        .secondaryButton {
          background: #48415f;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .searchSection {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }

        .searchSection input {
          flex: 1;
          padding: 13px 16px;
          border: 2px solid #655d90;
          border-radius: 10px;
          outline: none;
          font-size: 16px;
        }

        .resultCount {
          padding: 13px 16px;
          border-radius: 9px;
          background: #655d90;
          color: white;
        }

        .tableWrapper {
          width: 100%;
          overflow-x: auto;
          border-radius: 14px;
          background: white;
          box-shadow: 0 5px 20px rgba(63, 55, 91, 0.12);
        }

        table {
          width: 100%;
          min-width: 1300px;
          border-collapse: collapse;
          text-align: center;
        }

        th {
          padding: 15px 10px;
          background: #655d90;
          color: white;
          white-space: nowrap;
        }

        td {
          padding: 12px 10px;
          border-bottom: 1px solid #ebe9f0;
        }

        tbody tr:nth-child(even) {
          background: #f9f8fc;
        }

        tbody tr:hover {
          background: #f1eff7;
        }

        .medicineName {
          font-weight: 700;
          text-align: right;
        }

        .goodQuantity {
          color: #15803d;
          font-weight: 700;
        }

        .lowQuantity {
          color: #b42318;
          font-weight: 700;
        }

        .badges {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 5px;
        }

        .badge {
          padding: 5px 9px;
          border-radius: 20px;
          font-size: 12px;
          white-space: nowrap;
        }

        .validBadge {
          background: #dcfce7;
          color: #166534;
        }

        .lowBadge {
          background: #fff3cd;
          color: #8a5a00;
        }

        .soonBadge {
          background: #ffedd5;
          color: #9a3412;
        }

        .expiredBadge {
          background: #fee2e2;
          color: #b42318;
        }

        .quantityInput {
          width: 80px;
          padding: 9px;
          border: 1px solid #655d90;
          border-radius: 7px;
          text-align: center;
        }

        .addStockButton,
        .dispenseButton,
        .deleteButton {
          min-width: 65px;
          padding: 9px 11px;
          border: 0;
          border-radius: 7px;
          color: white;
          cursor: pointer;
        }

        .addStockButton {
          background: #198754;
        }

        .dispenseButton {
          background: #655d90;
        }

        .deleteButton {
          background: #dc3545;
        }

        .messageBox {
          padding: 28px;
          border: 1px solid #dedbe6;
          border-radius: 12px;
          background: white;
          text-align: center;
        }

        .errorBox {
          color: #b42318;
          border-color: #b42318;
        }

        .modalOverlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(28, 25, 35, 0.6);
        }

        .medicineForm {
          width: 100%;
          max-width: 680px;
          padding: 26px;
          border-top: 6px solid #655d90;
          border-radius: 16px;
          background: white;
        }

        .formHeader {
          display: flex;
          justify-content: space-between;
          margin-bottom: 24px;
          padding-bottom: 18px;
          border-bottom: 1px solid #e8e6ee;
        }

        .formHeader h2 {
          margin: 0 0 7px;
          color: #655d90;
        }

        .formHeader p {
          margin: 0;
          color: #77717f;
        }

        .closeButton {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 50%;
          background: #efedf4;
          font-size: 25px;
          cursor: pointer;
        }

        .formGrid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .formGrid label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-weight: 600;
        }

        .fullWidth {
          grid-column: 1 / -1;
        }

        .formGrid input,
        .formGrid select {
          height: 46px;
          padding: 10px 12px;
          border: 1px solid #d7d3df;
          border-radius: 8px;
          outline: none;
        }

        .formActions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 25px;
          padding-top: 18px;
          border-top: 1px solid #e8e6ee;
        }

        .cancelButton,
        .saveButton {
          padding: 11px 22px;
          border: 0;
          border-radius: 8px;
          cursor: pointer;
        }

        .cancelButton {
          background: #ebe9ef;
        }

        .saveButton {
          background: #655d90;
          color: white;
        }

        @media (max-width: 700px) {
          .searchSection {
            flex-direction: column;
          }

          .formGrid {
            grid-template-columns: 1fr;
          }

          .fullWidth {
            grid-column: auto;
          }
        }
      `}</style>
    </main>
  );
}

function getMedicineKey(medicine) {
  return (
    medicine["رمز الدواء"] ||
    medicine.row_number ||
    medicine["اسم الدواء"]
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("ar");
}

function toNumber(value) {
  if (typeof value === "number") {
    return value;
  }

  const cleaned = String(value ?? "")
    .replace(/[$,\s]/g, "")
    .trim();

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function parseExpiryDate(value) {
  if (!value) {
    return null;
  }

  const text = String(value).trim();

  const match = text.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/
  );

  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallback = new Date(text);

  return Number.isNaN(fallback.getTime())
    ? null
    : fallback;
}

function getExpiryStatus(value) {
  const expiryDate = parseExpiryDate(value);

  if (!expiryDate) {
    return "unknown";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  expiryDate.setHours(23, 59, 59, 999);

  const threeMonthsLater = new Date(today);
  threeMonthsLater.setMonth(
    threeMonthsLater.getMonth() + 3
  );

  if (expiryDate < today) {
    return "expired";
  }

  if (expiryDate <= threeMonthsLater) {
    return "soon";
  }

  return "valid";
}

function formatDate(value) {
  const date = parseExpiryDate(value);

  if (!date) {
    return "غير محدد";
  }

  return new Intl.DateTimeFormat("ar-IQ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  return new Intl.NumberFormat("ar-IQ").format(
    toNumber(value)
  );
}
