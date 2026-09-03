# Crypto Strategy Lab: Nội dung thuyết trình kiến trúc trong 5 phút

Tài liệu này được thiết kế cho phần thuyết trình slide kéo dài 5 phút, sau đó chuyển sang demo trực tiếp. Slide chỉ tóm
tắt kiến trúc; demo sẽ chứng minh luồng sử dụng và các hành vi có thể quan sát được.

## Thông điệp chính

> Crypto Strategy Lab là một nền tảng thử nghiệm chiến lược crypto có khả năng mở rộng. Có thể thêm sàn giao dịch mới,
> chiến lược mới hoặc thuật toán tìm kiếm mới mà không phải viết lại pipeline phía sau.

## Phân bổ thời gian

| Slide         | Nội dung                                      | Thời lượng |
| ------------- | --------------------------------------------- | ---------: |
| 1             | System Context — Bối cảnh hệ thống            |       1:00 |
| 2             | Container / Module View — Container và module |       1:20 |
| 3             | Architecture Checklist — Checklist kiến trúc  |       1:30 |
| 4             | Architecture Evaluation — Đánh giá kiến trúc  |       1:10 |
| **Tổng cộng** |                                               |   **5:00** |

Không cần thêm slide mục lục riêng. Đặt tên dự án và thông điệp chính ngay trên Slide 1.

---

## Slide 1 — System Context

### Tiêu đề slide

**System Context — Các ranh giới rõ ràng quanh nền tảng giao dịch**

### Nội dung trên slide

```text
                         Crypto Strategy Lab
 ┌──────────────────────────────────────────────────────────────┐
 │                                                              │
 │  Người dùng                                                   │
 │      │                                                       │
 │      ▼                                                       │
 │  Next.js Frontend ── HTTP / Socket.IO ──► Express Backend   │
 │                                             │                │
 │                                             ├── PostgreSQL   │
 │                                             │   dữ liệu chính │
 │                                             │   queue + outbox│
 │                                             │                │
 │                                             ├── Exchange Adapter ──► Binance
 │                                             │                       REST/WebSocket
 │                                             │                │
 │                                             ├── News Crawler ──► News Providers
 │                                             │                          │
 │                                             │                          ▼
 │                                             │                     News Sources
 │                                             │                │
 │                                             └── LLM JSON Provider ─► Gemini/Groq
 │                                                              │
 │  Backtest Worker độc lập ───────────────────► PostgreSQL     │
 │                                                              │
 └──────────────────────────────────────────────────────────────┘
```

### Ba điểm cần nhấn mạnh

- **Frontend không kết nối trực tiếp tới Binance.**
- **Các provider bên ngoài được che giấu sau các interface ở backend.**
- **Việc chạy backtest được tách khỏi ứng dụng web.**
- **Nginx là cấu hình triển khai tùy chọn, không phải component nghiệp vụ.**

### Ghi chú thuyết trình

> “Ở mức System Context, Crypto Strategy Lab có một ranh giới ứng dụng rõ ràng. Frontend chỉ giao tiếp với Express
> Backend thông qua HTTP và Socket.IO. Market data đi qua Exchange Adapter, news đi qua News Provider, còn backtest
> được thực thi bởi một Worker độc lập. PostgreSQL vừa là nơi lưu trữ dữ liệu chính vừa là durable queue.”

### Nguồn tham chiếu

- [Architecture Document — System context](architecture.md#system-context)
- [Backend composition root](../apps/backend/src/index.ts)
- [Exchange Adapter interface](../apps/backend/src/api/features/marketData/application/interfaces/exchangeAdapter.interface.ts)
- [News Provider interface](../apps/backend/src/api/features/news/services/interfaces/newsProvider.interface.ts)

---

## Slide 2 — Container / Module View

### Tiêu đề slide

**Container View — Modular monolith với worker có thể mở rộng độc lập**

### Nội dung trên slide

```text
┌─────────────────────┐       HTTP / Socket.IO       ┌─────────────────────────────┐
│ Next.js Frontend    │ ◄──────────────────────────► │ Express Backend             │
│                     │                              │ Modular Monolith            │
│ Biểu đồ, biểu mẫu,  │                              │                             │
│ UI theo User        │                              │ Market                      │
└─────────────────────┘                              │ Strategy                    │
                                                     │ Experiment / Backtest       │
                                                     │ Search                      │
                                                     │ News / Sentiment            │
                                                     │ Evaluation                  │
                                                     │ Ranking / Leaderboard       │
                                                     │ Authentication / Operations │
                                                     │ Outbox / Event Bus           │
                                                     └──────────────┬──────────────┘
                                                                    │
                                                                    ▼
                                                           ┌─────────────────┐
                                                           │ PostgreSQL       │
                                                           │ Dữ liệu + Queue  │
                                                           │ Outbox + Top-K   │
                                                           └────────┬────────┘
                                                                    ▲
                                                                    │ claim / lease
                                                           ┌────────┴────────┐
                                                           │ Backtest Worker │
                                                           │ simulate/evaluate│
                                                           └─────────────────┘
```

### Trách nhiệm của các module

| Module                      | Sở hữu / chịu trách nhiệm                                                  |
| --------------------------- | -------------------------------------------------------------------------- |
| Market                      | Candle đã chuẩn hóa, khôi phục realtime stream và Dataset Snapshot lịch sử |
| Strategy                    | Strategy plugin, registry, signal và composite strategy                    |
| Experiment                  | Chuẩn bị Dataset Snapshot, Experiment và Backtest Job                      |
| Search                      | `StrategyGenerator`, `SearchRun` và sinh candidate                         |
| Evaluation                  | Simulation rules, Trade và metric                                          |
| Ranking                     | Projection Top-K của Leaderboard                                           |
| News / Sentiment            | Thu thập news, provider và chấm điểm sentiment                             |
| Authentication / Operations | Quyền sở hữu User, role, queue health và quan sát worker                   |

### Điểm nhấn chính

> **Market, Strategy, Search và News là các module bên trong Backend, không phải các microservice riêng lẻ. Backtest
> Worker là runtime có thể mở rộng độc lập.**

### Ghi chú thuyết trình

> “C4 Container View cho thấy các đơn vị có thể triển khai: Frontend, Backend, PostgreSQL và Backtest Worker. Backend vẫn
> là một modular monolith để các transaction cục bộ đơn giản và nhất quán. Chỉ phần backtest chạy lâu được tách riêng,
> vì vậy số lượng worker có thể tăng mà không cần sửa business logic chính.”

### Nguồn tham chiếu

- [Architecture Document — Container and module view](architecture.md#container-and-module-view)
- [Architecture Document — Backend module responsibilities](architecture.md#backend-module-responsibilities)
- [Backtest Worker composition root](../apps/backtest-worker/src/index.ts)
- [PostgreSQL Job Queue](../apps/backtest-worker/src/queue/PostgresJobQueue.ts)

---

## Slide 3 — Checklist kiến trúc

### Tiêu đề slide

**Checklist kiến trúc — Mười câu hỏi, mười câu trả lời rõ ràng**

Trên slide thật nên chia thành hai cột. Mỗi câu trả lời chỉ nên dài một dòng; phần chi tiết được nói bằng lời.

### Nội dung trên slide

|   # | Câu hỏi                                            | Câu trả lời                                                                                                                                                              |
| --: | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | **Architectural drivers là gì?**                   | Khả năng sửa đổi, thay thế, mở rộng, tin cậy, quan sát, tái lập và duy trì tài liệu.                                                                                     |
|   2 | **C4 Context và Container của nhóm là gì?**        | Context thể hiện User, external system và boundary. Container thể hiện Frontend, Backend, Worker, PostgreSQL và các module trong Backend.                                |
|   3 | **Boundary của các domain là gì?**                 | **Market:** market data chuẩn hóa. **Strategy:** signal và composition. **Experiment:** Dataset Snapshot, Experiment, Job. **News:** NewsItem thô và sentiment pipeline. |
|   4 | **Thêm Strategy mới sửa ở đâu?**                   | Implement `Strategy`, đăng ký trong `StrategyRegistry` và thêm test. Các component downstream không đổi.                                                                 |
|   5 | **Đổi Search algorithm sửa ở đâu?**                | Implement và đăng ký `StrategyGenerator` mới. Các module downstream chỉ nhận `CandidateStrategy` dạng opaque.                                                            |
|   6 | **Thêm Provider có làm Frontend đổi không?**       | Không. Thêm Exchange Adapter hoặc News Provider ở Backend; Frontend vẫn dùng contract chuẩn hóa.                                                                         |
|   7 | **100.000 backtest scale thế nào?**                | PostgreSQL durable queue, `SKIP LOCKED`, lease, giới hạn job đang chạy và benchmark với 1/2/4 worker.                                                                    |
|   8 | **Service lỗi có lan failure không?**              | Không. Binance chuyển sang `RECONNECTING`/`STALE`; một News Provider có thể lỗi độc lập; Worker retry Job mà không dừng ứng dụng web.                                    |
|   9 | **Duplicate, retry và event order xử lý thế nào?** | Giao hàng at-least-once, không đảm bảo thứ tự toàn cục, consumer idempotent, lease fencing, retry có giới hạn và dead-letter event.                                      |
|  10 | **Leaderboard result truy provenance thế nào?**    | `Leaderboard Entry → Experiment → Strategy Version + Dataset Snapshot + generator seed + execution versions + build revision`.                                           |

### Ghi chú thuyết trình

> “Ba câu đầu xác định ranh giới. Câu bốn đến câu sáu chứng minh hệ thống dễ sửa và dễ thay thế. Câu bảy đến câu chín
> nói về khả năng mở rộng và độ tin cậy. Câu mười chứng minh leaderboard result có thể tái lập và truy ngược.”

### Nguồn tham chiếu

- [Architecture Document — Stable extension seams](architecture.md#stable-extension-seams)
- [Architecture Document — Runtime and data flows](architecture.md#runtime-and-data-flows)
- [Architecture Document — Job retry and lease loss](architecture.md#job-retry-and-lease-loss)
- [Architecture Document — Outbox redelivery and dead letter](architecture.md#outbox-redelivery-and-dead-letter)
- [Architecture Document — Experiment provenance](architecture.md#experiment-provenance-and-reproducibility)
- [Parent Issue #82](https://github.com/danzgne/crypto-strategy-lab/issues/82)

---

## Slide 4 — Đánh giá kiến trúc

### Tiêu đề slide

**Đánh giá kiến trúc — Cách kiểm chứng thiết kế**

### Nội dung trên slide

| Tiêu chí                                    | Câu hỏi kiểm chứng                                          | Bằng chứng / kết quả mong đợi                                                                                                                     |
| ------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modifiability (Dễ sửa đổi)**              | Thêm MACD phải sửa bao nhiêu thành phần?                    | Một Strategy implementation, registry entry và test. Backtester, Evaluator, Ranking, Visualization và Frontend không đổi.                         |
| **Replaceability (Dễ thay thế)**            | Random → Domain-guided có ảnh hưởng Backtester không?       | Không. Chỉ `StrategyGenerator` đã đăng ký thay đổi. Backtester nhận `CandidateStrategy`.                                                          |
| **Scalability (Khả năng mở rộng)**          | Tăng số worker có cần sửa code lõi không?                   | Không. Worker claim Job bằng `SKIP LOCKED`, lease và unique worker identity.                                                                      |
| **Reliability (Độ tin cậy)**                | News hoặc Binance lỗi thì chuyện gì xảy ra?                 | Lỗi News chỉ ảnh hưởng provider đó. Market chuyển `RECONNECTING`/`STALE` rồi tự khôi phục. Backtest Job retry có giới hạn.                        |
| **Observability (Khả năng quan sát)**       | Admin có nhìn thấy tình trạng hệ thống không?               | `/admin/operations` hiển thị độ sâu queue, Job cũ nhất, latency P50/P95, throughput, retry, failure, lease loss, worker health và outbox backlog. |
| **Reproducibility (Khả năng tái lập)**      | Top-K có truy được đầu vào chính xác không?                 | Leaderboard Entry link tới Experiment với parameter, dataset fingerprint, generator provenance, execution version và build revision.              |
| **Documentation (Tính nhất quán tài liệu)** | Context, Container, Dynamic View và ADR có khớp code không? | Tên, hướng dependency, ownership, ngữ nghĩa lỗi và Mermaid diagram khớp với contract hiện tại.                                                    |
| **Trade-off reasoning (Lý giải đánh đổi)**  | Mỗi technology choice có nêu cost không?                    | PostgreSQL queue được dùng hiện tại; Redis và BullMQ được trì hoãn. Mỗi lựa chọn có lợi ích, hệ quả và trigger đo được.                           |

### Trade-off cần giải thích bằng lời

- **PostgreSQL queue:** giữ Experiment, Job và outbox trong cùng transaction; hệ quả là tranh chấp khi database claim
  Job.
- **Redis cache:** chưa thêm vì chưa có số liệu chứng minh áp lực đọc lặp lại.
- **BullMQ:** chưa thêm vì sẽ tạo dependency vào Redis và vấn đề nhất quán giữa PostgreSQL và Redis.
- **Nginx:** tùy chọn để kiểm thử triển khai same-origin; không thuộc domain model.

Các trigger được ghi trong Architecture Document:

- Xem xét lại PostgreSQL queue nếu queue-wait P95 vượt khoảng **1 giây**, hoặc tăng từ hai lên bốn worker cho throughput
  dưới **1.5×** trong khi PostgreSQL connections đã bão hòa.
- Xem xét Redis nếu các lần đọc database lặp lại vượt khoảng **50%** và API P95 vẫn trên **200 ms** cho workload đó.
- Chỉ xem xét BullMQ nếu tối ưu PostgreSQL vẫn không đủ, hoặc cần priority phức tạp, delayed job hay rate limiting.

### Speaker notes

> “Kiến trúc không được đánh giá chỉ bằng việc diagram có đẹp hay không, mà bằng việc mỗi câu hỏi về khả năng mở rộng,
> lỗi, scale và tái lập đều có câu trả lời quan sát được. Các bằng chứng chi tiết được ghi trong parent issue và các
> child issue.”

### Nguồn tham chiếu

- [Architecture Document — Infrastructure decisions and scaling evidence](architecture.md#infrastructure-decisions-and-scaling-evidence)
- [Architecture Document — Verification map](architecture.md#verification-map)
- [Admin Operations service](../apps/backend/src/api/features/admin/services/operationsService.ts)
- [Architecture Document — Experiment provenance](architecture.md#experiment-provenance-and-reproducibility)

---

## Chuyển sang phần demo

Nói câu sau:

> “Các slide vừa trình bày các ranh giới và các bảo đảm kiến trúc. Bây giờ tôi sẽ demo toàn bộ luồng trong sản phẩm.”

Thực hiện demo theo thứ tự:

1. Mở biểu đồ realtime với nhiều timeframe.
2. Chọn các Strategy đã đăng ký và hiển thị signal overlay.
3. Tạo một Composite Strategy.
4. Gửi một manual Backtest.
5. Hiển thị Experiment đang queued, Dataset fingerprint, metric, Trade và Entry/Exit point.
6. Mở Leaderboard và truy ngược kết quả về provenance.
7. Mở News, thu thập các Source đang enabled và hiển thị NewsItem chuẩn hóa cùng Sentiment Aggregate.
8. Nếu còn thời gian, hiển thị tiến trình SearchRun và Operations dashboard dành riêng cho Admin.

## Lưu ý khi trình bày

- Dùng sơ đồ trong Architecture Document làm nguồn, nhưng đơn giản hóa để nhãn vẫn đọc được trên máy chiếu.
- Không giải thích từng bảng database hoặc từng ADR trong phần 5 phút.
- Không nói hệ thống thực hiện 100.000 lần chạy đồng thời; mục tiêu benchmark là 100.000 Job trong một campaign.
- Không mô tả Market, Strategy, Search hoặc News là các microservice độc lập. Đây là các module trong Express Backend.
- Để trả lời câu hỏi sâu hơn, tham khảo [parent Issue #82](https://github.com/danzgne/crypto-strategy-lab/issues/82)
  và [Architecture Document](architecture.md).
