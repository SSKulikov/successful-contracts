document.getElementById("uploadFileBtn").addEventListener("click", function () {
    document.getElementById("fileInput").click(); // Открываем окно выбора файла
});

document.getElementById("fileInput").addEventListener("change", function () {
    uploadFile(this.files[0]); // Передаем файл в функцию uploadFile
});

document.getElementById("myForm").addEventListener("submit", function (event) {
    event.preventDefault(); // Предотвращаем стандартную отправку формы
    saveFormData();
});

function showSpinner() {
    document.getElementById("loadingSpinner").style.display = "block";
}

function hideSpinner() {
    document.getElementById("loadingSpinner").style.display = "none";
}

async function uploadFile(file) {
    if (!file) return; // Если файл не выбран, ничего не делаем

    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (!allowedTypes.includes(file.type)) {
        alert("Можно загружать только PDF или Word-документы (.pdf, .doc, .docx)");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    showSpinner();
    try {
        const response = await axios.post("http://localhost:3003/api/parse-file", formData, {
            headers: {"Content-Type": "multipart/form-data"}
        });

        console.log("Файл успешно отправлен", response.data);
        fillForm(response.data.parsedJson);
    } catch (error) {
        console.error("Ошибка загрузки файла:", error);
    } finally {
        hideSpinner();
    }
}

async function saveFormData() {
    const formData = {};
    document.querySelectorAll("#myForm input").forEach(input => {
        formData[input.id] = input.value;
    });

    showSpinner();
    try {
        const response = await axios.post("http://localhost:3003/api/save-data-info", formData, {
            headers: {"Content-Type": "application/json"}
        });
        console.log("Данные успешно сохранены", response.data);
        await clearForm();
        alert("Данные успешно сохранены!");
        window.location.reload();
    } catch (error) {
        console.error("Ошибка сохранения данных:", error);
    } finally {
        hideSpinner();
    }
}

function fillForm(data) {
    // Поставщик
    if (data.supplier.name) document.getElementById("supplier_name").value = data.supplier.name;
    if (data.supplier.inn) document.getElementById("supplier_inn").value = data.supplier.inn;
    if (data.supplier.kpp) document.getElementById("supplier_kpp").value = data.supplier.kpp;
    if (data.supplier.ogrn) document.getElementById("supplier_ogrn").value = data.supplier.ogrn;
    if (data.supplier.bik) document.getElementById("supplier_bik").value = data.supplier.bik;
    if (data.supplier.corr_account) document.getElementById("supplier_corr_account").value = data.supplier.corr_account;
    if (data.supplier.payment_account) document.getElementById("supplier_payment_account").value = data.supplier.payment_account;
    if (data.supplier.email) document.getElementById("supplier_email").value = data.supplier.email;
    if (data.supplier.phone) document.getElementById("supplier_phone").value = data.supplier.phone;
    if (data.supplier.address) document.getElementById("supplier_address").value = data.supplier.address;
    if (data.supplier.bank_name) document.getElementById("supplier_bank_name").value = data.supplier.bank_name;

    // Заказчик
    if (data.customer.name) document.getElementById("customer_name").value = data.customer.name;
    if (data.customer.inn) document.getElementById("customer_inn").value = data.customer.inn;
    if (data.customer.kpp) document.getElementById("customer_kpp").value = data.customer.kpp;
    if (data.customer.ogrn) document.getElementById("customer_ogrn").value = data.customer.ogrn;
    if (data.customer.bik) document.getElementById("customer_bik").value = data.customer.bik;
    if (data.customer.corr_account) document.getElementById("customer_corr_account").value = data.customer.corr_account;
    if (data.customer.payment_account) document.getElementById("customer_payment_account").value = data.customer.payment_account;
    if (data.customer.email) document.getElementById("customer_email").value = data.customer.email;
    if (data.customer.phone) document.getElementById("customer_phone").value = data.customer.phone;
    if (data.customer.address) document.getElementById("customer_address").value = data.customer.address;
    if (data.customer.bank_name) document.getElementById("customer_bank_name").value = data.customer.bank_name;

    // Договор
    // if (data.contract_type) document.getElementById("contract_type").value = data.contract_type;
    if (data.contract_number) document.getElementById("contract_number").value = data.contract_number;
    if (data.contract_subject) document.getElementById("contract_subject").value = data.contract_subject;
    if (data.contract_sum) document.getElementById("contract_sum").value = data.contract_sum;
    if (data.contract_currency) document.getElementById("contract_currency").value = data.contract_currency;
    // if (data.payment_1_sum) document.getElementById("payment_1_sum").value = data.payment_1_sum;
    // if (data.payment_1_date) document.getElementById("payment_1_date").value = data.payment_1_date;
    // if (data.payment_2_sum) document.getElementById("payment_2_sum").value = data.payment_2_sum;
    // if (data.payment_2_date) document.getElementById("payment_2_date").value = data.payment_2_date;
    if (data.contract_date) document.getElementById("contract_date").value = data.contract_date;
    if (data.contract_start_date) document.getElementById("contract_start_date").value = data.contract_start_date;
    if (data.contract_end_date) document.getElementById("contract_end_date").value = data.contract_end_date;
    if (data.item) document.getElementById("item").value = data.item;


}



function clearForm() {

        document.getElementById("supplier_name").value = null
        document.getElementById("supplier_inn").value = null
        document.getElementById("supplier_kpp").value = null
        document.getElementById("supplier_ogrn").value = null
        document.getElementById("supplier_bik").value = null
        document.getElementById("supplier_corr_account").value = null
        document.getElementById("supplier_payment_account").value = null
        document.getElementById("supplier_email").value = null
        document.getElementById("supplier_phone").value = null
        document.getElementById("supplier_address").value = null
        document.getElementById("supplier_bank_name").value = null

    // Заказчик
        document.getElementById("customer_name").value = null
        document.getElementById("customer_inn").value = null
        document.getElementById("customer_kpp").value = null
        document.getElementById("customer_ogrn").value = null
        document.getElementById("customer_bik").value = null
        document.getElementById("customer_corr_account").value = null
        document.getElementById("customer_payment_account").value = null
        document.getElementById("customer_email").value = null
        document.getElementById("customer_phone").value = null
        document.getElementById("customer_address").value = null
        document.getElementById("customer_bank_name").value = null

    // Договор
        document.getElementById("contract_number").value = null
        document.getElementById("contract_subject").value = null
        document.getElementById("contract_sum").value = null
        document.getElementById("contract_currency").value = null
        document.getElementById("contract_date").value = null
        document.getElementById("contract_start_date").value = null
        document.getElementById("contract_end_date").value = null
        document.getElementById("item").value = null

}
