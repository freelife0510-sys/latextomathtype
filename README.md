# LaTeX to Word Equation App

Ứng dụng web tĩnh để chuyển LaTeX sang công thức chỉnh sửa được trong Microsoft Word.

## Tính năng

- Nhập nhiều công thức LaTeX, mỗi dòng là một công thức.
- Preview ngay trong trình duyệt.
- Chuyển đổi sang Word equation và tải `.docx`.
- Copy LaTeX hoặc MathML preview.
- Hỗ trợ block mode và inline mode.

## Chạy local

Vì app dùng ES modules qua CDN, bạn có thể chạy bằng bất kỳ static server nào.

### Cách 1: mở trực tiếp

Mở `index.html` trong trình duyệt hiện đại.

### Cách 2: chạy bằng Python

```bash
python -m http.server 8080
```

Sau đó mở `http://localhost:8080`

## Ghi chú kỹ thuật

- Preview dùng `temml`.
- Xuất Word dùng `@seewo-doc/docx` và `@seewo-doc/docx-math-converter`.
- Khi deploy production, nên pin version CDN như trong mã nguồn hiện tại.

## Hạn chế

- App phụ thuộc CDN để tải thư viện.
- Một số lệnh LaTeX rất đặc thù có thể render khác Word.
- Mục tiêu đầu ra là **Word native equation (OMML/docx)**, gần tương đương nhu cầu dùng MathType trong Word.
