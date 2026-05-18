package com.smcs.smcsschedule.controllers;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.smcs.smcsschedule.models.Block;
import com.smcs.smcsschedule.services.AuthService;
import com.smcs.smcsschedule.services.ScheduleService;

@RestController
@RequestMapping("/api")
public class ApiController {

	private final AuthService authService;
	private final ScheduleService scheduleService;

	public ApiController(AuthService authService, ScheduleService scheduleService) {
		this.authService = authService;
		this.scheduleService = scheduleService;
	}

	@PostMapping("/login")
	public ResponseEntity<?> login(@RequestBody LoginRequest request) {
		String token = authService.login(request.username, request.password);
		if (token == null) {
			return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
		}

		return ResponseEntity.ok(new LoginResponse(true, token));
	}

	@GetMapping("/schedule")
	public ResponseEntity<?> getSchedule(@RequestHeader(value = "X-Session-Token", required = false) String token) {
		if (!authService.isValidToken(token)) {
			return unauthorized();
		}

		return ResponseEntity.ok(scheduleService.findAll());
	}

	@PostMapping("/blocks")
	public ResponseEntity<?> createBlock(@RequestHeader(value = "X-Session-Token", required = false) String token,
			@RequestBody Block block) {
		if (!authService.isValidToken(token)) {
			return unauthorized();
		}

		return ResponseEntity.ok(scheduleService.create(block));
	}

	@PutMapping("/blocks/{id}")
	public ResponseEntity<?> updateBlock(@RequestHeader(value = "X-Session-Token", required = false) String token,
			@PathVariable String id, @RequestBody Block block) {
		if (!authService.isValidToken(token)) {
			return unauthorized();
		}

		Block updated = scheduleService.update(id, block);
		if (updated == null) {
			return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
		}

		return ResponseEntity.ok(updated);
	}

	@DeleteMapping("/blocks/{id}")
	public ResponseEntity<?> deleteBlock(@RequestHeader(value = "X-Session-Token", required = false) String token,
			@PathVariable String id) {
		if (!authService.isValidToken(token)) {
			return unauthorized();
		}

		return scheduleService.delete(id) ? ResponseEntity.noContent().build() : ResponseEntity.status(HttpStatus.NOT_FOUND).build();
	}

	private ResponseEntity<Void> unauthorized() {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
	}

	public static class LoginRequest {
		public String username;
		public String password;
	}

	public static class LoginResponse {
		public boolean success;
		public String token;

		public LoginResponse(boolean success, String token) {
			this.success = success;
			this.token = token;
		}
	}
}
