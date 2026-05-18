package com.smcs.smcsschedule.models;

public class Block {
	public String id;
	public String day;
	public int periodStart;
	public int length;
	public String course;
	public String group;
	public String room;

	public Block() {
	}

	public Block(String id, String day, int periodStart, int length, String course, String group, String room) {
		this.id = id;
		this.day = day;
		this.periodStart = periodStart;
		this.length = length;
		this.course = course;
		this.group = group;
		this.room = room;
	}
}
