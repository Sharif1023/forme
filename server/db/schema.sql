CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(128) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  gender VARCHAR(12) NOT NULL,
  category VARCHAR(24) NOT NULL,
  description TEXT NOT NULL,
  price_paise BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(1024) NOT NULL DEFAULT '',
  style_json JSON NULL,
  colors_json JSON NOT NULL,
  sizes_json JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  studio_supported TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX products_active_category (active, category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS variants (
  id VARCHAR(180) PRIMARY KEY,
  product_id VARCHAR(128) NOT NULL,
  color_id VARCHAR(80) NOT NULL,
  color_name VARCHAR(100) NOT NULL,
  hex VARCHAR(7) NOT NULL,
  size VARCHAR(30) NOT NULL,
  sku VARCHAR(180) NOT NULL UNIQUE,
  price_paise BIGINT UNSIGNED NOT NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  reserved INT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT variants_product FOREIGN KEY (product_id) REFERENCES products(id),
  UNIQUE KEY variant_selection (product_id, color_id, size),
  CHECK (stock >= reserved),
  INDEX variants_stock (active, stock)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  email VARCHAR(254) NULL,
  phone VARCHAR(32) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coupons (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  type VARCHAR(12) NOT NULL,
  value BIGINT UNSIGNED NOT NULL,
  min_subtotal_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  max_discount_paise BIGINT UNSIGNED NULL,
  usage_limit INT UNSIGNED NULL,
  used_count INT UNSIGNED NOT NULL DEFAULT 0,
  starts_at DATETIME(3) NULL,
  ends_at DATETIME(3) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  order_number VARCHAR(32) NOT NULL UNIQUE,
  customer_id CHAR(36) NOT NULL,
  customer_json JSON NOT NULL,
  shipping_json JSON NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  payment_status VARCHAR(24) NOT NULL DEFAULT 'unpaid',
  payment_method VARCHAR(20) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BDT',
  subtotal_paise BIGINT UNSIGNED NOT NULL,
  discount_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  shipping_paise BIGINT UNSIGNED NOT NULL DEFAULT 0,
  total_paise BIGINT UNSIGNED NOT NULL,
  coupon_id CHAR(36) NULL,
  coupon_code VARCHAR(40) NULL,
  coupon_released TINYINT(1) NOT NULL DEFAULT 0,
  reservation_status VARCHAR(20) NOT NULL DEFAULT 'reserved',
  reservation_expires_at DATETIME(3) NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  request_hash CHAR(64) NOT NULL,
  lookup_token_hash CHAR(64) NOT NULL,
  gateway_transaction_id VARCHAR(30) NOT NULL UNIQUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  INDEX orders_status_created (status, created_at),
  INDEX orders_reservation (reservation_status, reservation_expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_items (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  variant_id VARCHAR(180) NOT NULL,
  product_id VARCHAR(128) NOT NULL,
  name VARCHAR(180) NOT NULL,
  color_id VARCHAR(80) NOT NULL,
  color_name VARCHAR(100) NOT NULL,
  size VARCHAR(30) NOT NULL,
  sku VARCHAR(180) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price_paise BIGINT UNSIGNED NOT NULL,
  total_paise BIGINT UNSIGNED NOT NULL,
  image_url VARCHAR(1024) NOT NULL DEFAULT '',
  CONSTRAINT items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT items_variant FOREIGN KEY (variant_id) REFERENCES variants(id),
  INDEX items_order_id (order_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  method VARCHAR(20) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  amount_paise BIGINT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'BDT',
  transaction_id VARCHAR(128) NULL UNIQUE,
  gateway_transaction_id VARCHAR(30) NULL UNIQUE,
  gateway_session_id VARCHAR(255) NULL,
  reference VARCHAR(128) NULL,
  sender_phone VARCHAR(32) NULL,
  verified_payload JSON NULL,
  paid_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT payments_order FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX payments_order_id (order_id),
  INDEX payments_status_created (status, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'support',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  admin_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT sessions_admin FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  INDEX sessions_expiry (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_events (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL,
  note TEXT NULL,
  actor_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT events_order FOREIGN KEY (order_id) REFERENCES orders(id),
  INDEX events_order_created (order_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) PRIMARY KEY,
  actor_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(180) NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  value_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_tryon (
  product_id VARCHAR(128) PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  color_images_json JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT tryon_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tryon_usage (
  usage_day DATE PRIMARY KEY,
  generation_count INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tryon_jobs (
  id CHAR(36) PRIMARY KEY,
  cache_key CHAR(64) NOT NULL UNIQUE,
  gender VARCHAR(5) NOT NULL,
  outfit_json JSON NOT NULL,
  sources_json JSON NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  image_url VARCHAR(1024) NOT NULL DEFAULT '',
  error_code VARCHAR(80) NULL,
  error_message VARCHAR(400) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  lease_token CHAR(36) NULL,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX tryon_queue (status,created_at)
) ENGINE=InnoDB;
