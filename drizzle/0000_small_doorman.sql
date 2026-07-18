CREATE TABLE `pantry_donations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`food_name` text NOT NULL,
	`quantity` text NOT NULL,
	`expiry_date` text NOT NULL,
	`pickup_area` text NOT NULL,
	`pickup_details` text DEFAULT '' NOT NULL,
	`donor_name` text DEFAULT 'Community member' NOT NULL,
	`contact` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`image` text,
	`claimed` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
