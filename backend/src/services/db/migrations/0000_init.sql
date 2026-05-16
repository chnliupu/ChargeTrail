CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chargeSessions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`connectorId` text,
	`providerSessionId` text,
	`startedAt` text NOT NULL,
	`endedAt` text,
	`powerKwh` real NOT NULL,
	`durationSeconds` integer NOT NULL,
	`price` real NOT NULL,
	`pricePerHour` real,
	`pricePerKwh` real,
	`currency` text,
	`lat` real,
	`lon` real,
	`address1` text,
	`city` text,
	`state` text,
	`zipcode` text,
	`country` text,
	`deviceName` text,
	`deviceId` integer,
	`vehicleId` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connectorId`) REFERENCES `connector`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_charge_sessions_user_started` ON `chargeSessions` (`userId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `idx_charge_sessions_connector_started` ON `chargeSessions` (`connectorId`,`startedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `charge_sessions_connector_provider` ON `chargeSessions` (`connectorId`,`providerSessionId`);--> statement-breakpoint
CREATE TABLE `connector` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`providerUsername` text NOT NULL,
	`providerPassword` text,
	`token` text,
	`userId` text NOT NULL,
	`createdAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`lastSyncedAt` integer,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_connector_user` ON `connector` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `connector_user_provider_username` ON `connector` (`userId`,`provider`,`providerUsername`);--> statement-breakpoint
CREATE TABLE `invite` (
	`id` text PRIMARY KEY NOT NULL,
	`codeHash` text NOT NULL,
	`createdBy` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	`usedAt` integer,
	`usedBy` text,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`usedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codeHash_unique` ON `invite` (`codeHash`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`impersonatedBy` text,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`role` text DEFAULT 'user',
	`banned` integer,
	`banReason` text,
	`banExpires` integer,
	`username` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
